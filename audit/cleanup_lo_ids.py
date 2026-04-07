#!/usr/bin/env python3
"""
LO ID Cleanup Script - SAFE VERSION
====================================
Adds canonicalLoId field to all LOs without changing primary keys.

This preserves existing references in other tables (questions, etc.)
while enabling proper audit/tag matching with PDF syllabus.

SAFETY FEATURES:
1. DEFAULT DRY-RUN
2. Backup before changes
3. User confirmation required
4. Rollback capability

Usage:
    python cleanup_lo_ids.py              # Report only
    python cleanup_lo_ids.py --dry-run    # Show what would change
    python cleanup_lo_ids.py --apply      # Apply fixes with confirmation
    python cleanup_lo_ids.py --rollback backups/rollback_*.json
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime
from typing import Dict, List, Tuple, Optional

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()

TABLE_NAME = os.getenv('DYNAMODB_TABLE', 'aeropilot-easa-objectives')
AWS_REGION = os.getenv('AWS_REGION', 'eu-central-1')
BACKUP_DIR = os.getenv('BACKUP_DIR', './backups')

# Regex to extract LO ID from messy strings
LO_ID_PATTERNS = [
    re.compile(r'(\d{3}\.\d{2}\.\d{2}\.\d{2})'),  # Standard: 010.01.01.01
    re.compile(r'(\d{1,3}\.\d{1,2}\.\d{1,2}\.\d{1,2}\.\d{1,2})'),  # 5-part: 10.1.1.1.1
    re.compile(r'(\d{1,3}\.\d{1,2}\.\d{1,2}\.\d{1,2})'),  # 4-part: 10.1.1.1
    re.compile(r'(\d{2,3}\.\d{1,2})'),  # Short: 30.8
]


def normalize_lo_id(lo_id: str) -> Optional[str]:
    """
    Normalize LO ID to standard format XXX.XX.XX.XX.XX (5 parts).
    Returns None if cannot normalize.
    """
    if not lo_id:
        return None
    
    # First try to extract just the numeric part
    clean = lo_id.strip()
    
    # Remove common suffixes/prefixes
    clean = re.sub(r'(Identify|Describe|Recall|Explain|State|List|Calculate|Define|Name|Select):?$', '', clean, flags=re.IGNORECASE)
    clean = re.sub(r'\([a-z]\)$', '', clean)  # Remove (a), (b), etc.
    clean = re.sub(r'^[A-Za-z]+', '', clean)  # Remove text prefixes
    clean = clean.strip(':() ')
    
    # Try to match patterns
    for pattern in LO_ID_PATTERNS:
        match = pattern.search(clean)
        if match:
            parts = match.group(1).split('.')
            if len(parts) >= 4:
                # Normalize to 5 parts: XXX.XX.XX.XX.XX
                subject = parts[0].zfill(3)
                rest = [p.zfill(2) for p in parts[1:]]
                # Ensure exactly 5 parts
                while len(rest) < 4:
                    rest.append('00')
                rest = rest[:4]  # Max 4 parts after subject
                return '.'.join([subject] + rest)
            elif len(parts) == 2:
                # Short format like 30.8 - could be subject.topic
                # We'll keep it but note it
                subject = parts[0].zfill(3)
                topic = parts[1].zfill(2)
                return f"{subject}.{topic}.00.00.00"
    
    return None


class LOIDCleaner:
    """Clean up LO ID formats in DynamoDB."""

    def __init__(self, table_name: str, region: str = 'eu-central-1'):
        self.table_name = table_name
        self.dynamodb = boto3.resource('dynamodb', region_name=region)
        self.table = self.dynamodb.Table(table_name)
        self.client = boto3.client('dynamodb', region_name=region)

    def scan_all_los(self) -> List[Dict]:
        """Scan all LOs from DynamoDB."""
        print(f"🔍 Scanning DynamoDB table: {self.table_name}")
        los = []
        scan_kwargs = {}

        try:
            while True:
                response = self.table.scan(**scan_kwargs)
                los.extend(response.get('Items', []))

                if 'LastEvaluatedKey' not in response:
                    break

                scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']
                print(f"   Scanned {len(los)} items...")

        except ClientError as e:
            print(f"❌ DynamoDB error: {e}")
            sys.exit(1)

        print(f"✅ Loaded {len(los)} LOs from database")
        return los

    def analyze_lo_ids(self, los: List[Dict]) -> Dict:
        """Analyze LO IDs and categorize them."""
        categories = {
            'valid_5part': [],      # XXX.XX.XX.XX.XX
            'valid_4part': [],      # XXX.XX.XX.XX
            'with_text': [],        # Has text like Identify, Describe
            'with_parens': [],      # Has (a), (b), etc.
            'short': [],            # Less than 4 parts
            'invalid': [],          # Cannot parse
            'total': len(los),
        }

        for lo in los:
            raw_id = lo.get('loId', lo.get('losid', ''))
            normalized = normalize_lo_id(raw_id)
            
            if not raw_id:
                categories['invalid'].append({'raw': raw_id, 'lo': lo})
                continue

            # Check if it's already valid 5-part
            if re.match(r'^\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d{2}$', raw_id):
                categories['valid_5part'].append({'raw': raw_id, 'normalized': raw_id, 'lo': lo})
            # Check if it's valid 4-part
            elif re.match(r'^\d{3}\.\d{2}\.\d{2}\.\d{2}$', raw_id):
                categories['valid_4part'].append({'raw': raw_id, 'normalized': normalized, 'lo': lo})
            # Has text suffix
            elif re.search(r'(Identify|Describe|Recall|Explain|State|List|Calculate|Define|Name|Select):?$', raw_id, re.IGNORECASE):
                categories['with_text'].append({'raw': raw_id, 'normalized': normalized, 'lo': lo})
            # Has parentheses
            elif '(' in raw_id or ')' in raw_id:
                categories['with_parens'].append({'raw': raw_id, 'normalized': normalized, 'lo': lo})
            # Short format
            elif raw_id.count('.') < 3:
                categories['short'].append({'raw': raw_id, 'normalized': normalized, 'lo': lo})
            else:
                categories['invalid'].append({'raw': raw_id, 'normalized': normalized, 'lo': lo})

        return categories

    def generate_report(self, categories: Dict, output_file: str = None) -> str:
        """Generate analysis report."""
        lines = []
        lines.append("=" * 80)
        lines.append("LO ID CLEANUP ANALYSIS REPORT")
        lines.append(f"Generated: {datetime.now().isoformat()}")
        lines.append("=" * 80)
        lines.append("")

        total = categories['total']
        
        lines.append("SUMMARY")
        lines.append("-" * 40)
        lines.append(f"Total LOs: {total}")
        lines.append(f"Valid 5-part: {len(categories['valid_5part'])} ({len(categories['valid_5part'])/total*100:.1f}%)")
        lines.append(f"Valid 4-part: {len(categories['valid_4part'])} ({len(categories['valid_4part'])/total*100:.1f}%)")
        lines.append(f"With text suffix: {len(categories['with_text'])} ({len(categories['with_text'])/total*100:.1f}%)")
        lines.append(f"With parentheses: {len(categories['with_parens'])} ({len(categories['with_parens'])/total*100:.1f}%)")
        lines.append(f"Short format: {len(categories['short'])} ({len(categories['short'])/total*100:.1f}%)")
        lines.append(f"Invalid/Other: {len(categories['invalid'])} ({len(categories['invalid'])/total*100:.1f}%)")
        lines.append("")

        # Show examples of each category
        sections = [
            ('With text suffix (examples)', 'with_text'),
            ('With parentheses (examples)', 'with_parens'),
            ('Short format (examples)', 'short'),
            ('Invalid/Other (examples)', 'invalid'),
        ]

        for title, key in sections:
            items = categories[key]
            if not items:
                continue

            lines.append(title)
            lines.append("-" * 40)
            for item in items[:10]:
                raw = item['raw']
                norm = item.get('normalized', 'CANNOT_NORMALIZE')
                lines.append(f"  {raw} -> {norm}")
            if len(items) > 10:
                lines.append(f"  ... and {len(items) - 10} more")
            lines.append("")

        report = '\n'.join(lines)

        if output_file:
            with open(output_file, 'w') as f:
                f.write(report)
            print(f"📝 Report saved to: {output_file}")

        return report

    def _confirm_apply(self, total_fixes: int, force: bool = False) -> bool:
        """Ask for user confirmation."""
        if force:
            print("⚠️  FORCE MODE: Skipping confirmation (DANGEROUS!)")
            return True

        print(f"\n{'='*60}")
        print("⚠️  WARNING: You are about to add canonicalLoId to database!")
        print(f"   Table: {self.table_name}")
        print(f"   Items to update: {total_fixes}")
        print(f"{'='*60}")
        print("\nThis will:")
        print("  1. Create a backup of affected rows")
        print("  2. Add 'canonicalLoId' field to each LO")
        print("  3. Set updatedAt timestamp")
        print("\nThis is SAFE and will NOT break existing references.")
        print("Type 'YES' to proceed, or anything else to cancel:")

        try:
            response = input("> ").strip()
            return response == "YES"
        except (EOFError, KeyboardInterrupt):
            print("\n❌ Cancelled")
            return False

    def _create_backup(self, fixes: List[Dict]) -> str:
        """Create backup before changes."""
        os.makedirs(BACKUP_DIR, exist_ok=True)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = os.path.join(BACKUP_DIR, f'rollback_loids_{timestamp}.json')

        with open(backup_file, 'w') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'table': self.table_name,
                'count': len(fixes),
                'items': fixes
            }, f, indent=2, default=str)

        print(f"💾 Backup created: {backup_file}")
        return backup_file

    def apply_fixes(self, categories: Dict, dry_run: bool = True, force: bool = False) -> Dict:
        """Apply canonicalLoId field to all LOs that need it."""
        mode = "DRY RUN" if dry_run else "APPLYING"
        print(f"\n🔧 {mode} CANONICAL LO ID FIXES")
        print("-" * 40)

        # Build list of ALL items to update (add canonicalLoId)
        to_fix = []
        
        # Process all categories - we want canonicalLoId on ALL items
        all_categories = ['valid_5part', 'valid_4part', 'with_text', 'with_parens', 'short', 'invalid']
        
        for cat_name in all_categories:
            for item in categories.get(cat_name, []):
                raw_id = item['raw']
                normalized = item.get('normalized')
                
                # Skip if we couldn't normalize
                if not normalized:
                    continue
                    
                # Skip items that already have canonicalLoId matching normalized
                lo_data = item['lo']
                existing_canonical = lo_data.get('canonicalLoId')
                if existing_canonical == normalized:
                    continue
                
                to_fix.append({
                    'old_id': raw_id,
                    'canonical_id': normalized,
                    'category': cat_name,
                    'lo_data': lo_data,
                    'existing_canonical': existing_canonical
                })

        if not to_fix:
            print("✅ No fixes needed - all items have correct canonicalLoId!")
            return {'applied': 0, 'errors': [], 'backup_file': None}

        print(f"Found {len(to_fix)} items to update with canonicalLoId")

        # DRY RUN
        if dry_run:
            print("\n[DRY RUN - No changes will be made]")
            for fix in to_fix[:10]:
                print(f"  {fix['old_id']} -> canonicalLoId: {fix['canonical_id']} ({fix['category']})")
                if fix['existing_canonical']:
                    print(f"    (current canonicalLoId: {fix['existing_canonical']})")
            if len(to_fix) > 10:
                print(f"  ... and {len(to_fix) - 10} more")
            return {'applied': 0, 'errors': [], 'backup_file': None, 'planned': len(to_fix)}

        # APPLY MODE
        if not self._confirm_apply(len(to_fix), force):
            print("❌ Cancelled by user")
            return {'applied': 0, 'errors': [], 'backup_file': None}

        # Create backup
        backup_file = self._create_backup(to_fix)

        # Apply fixes
        fixes_applied = 0
        errors = []

        print(f"\nApplying {len(to_fix)} updates...")

        for fix in tqdm(to_fix, desc="Adding canonicalLoId"):
            old_id = fix['old_id']
            canonical_id = fix['canonical_id']

            try:
                # Determine key name
                lo_data = fix['lo_data']
                if 'loId' in lo_data:
                    key_name = 'loId'
                else:
                    key_name = 'losid'

                # Update item with canonicalLoId
                self.table.update_item(
                    Key={key_name: old_id},
                    UpdateExpression='SET canonicalLoId = :canonical, updatedAt = :now',
                    ExpressionAttributeValues={
                        ':canonical': canonical_id,
                        ':now': datetime.now().isoformat()
                    }
                )
                fixes_applied += 1

            except ClientError as e:
                errors.append(f"{old_id}: DynamoDB error - {e}")
            except Exception as e:
                errors.append(f"{old_id}: {e}")

        # Summary
        print(f"\n{'='*60}")
        print(f"✅ Updates applied: {fixes_applied}/{len(to_fix)}")
        if errors:
            print(f"❌ Errors: {len(errors)}")
            for err in errors[:5]:
                print(f"  - {err}")
        print(f"💾 Backup saved: {backup_file}")
        print(f"\nTo rollback: python cleanup_lo_ids.py --rollback {backup_file}")
        print(f"{'='*60}")

        return {
            'applied': fixes_applied,
            'errors': errors,
            'backup_file': backup_file,
            'total': len(to_fix)
        }

    def rollback(self, backup_file: str):
        """Rollback canonicalLoId changes."""
        print(f"🔄 Restoring from: {backup_file}")

        with open(backup_file, 'r') as f:
            backup = json.load(f)

        restored = 0
        errors = []

        for item in tqdm(backup['items'], desc="Restoring"):
            try:
                old_id = item['old_id']
                lo_data = item['lo_data']

                # Determine key name
                if 'loId' in lo_data:
                    key_name = 'loId'
                else:
                    key_name = 'losid'

                # Remove canonicalLoId field (set to empty or remove)
                # Option 1: Set to empty string
                # Option 2: Use REMOVE in UpdateExpression (but need to handle if doesn't exist)
                
                # Safer: just update timestamp without touching canonicalLoId
                # Or set canonicalLoId back to previous value if tracked
                existing_canonical = item.get('existing_canonical')
                
                if existing_canonical:
                    # Restore previous value
                    self.table.update_item(
                        Key={key_name: old_id},
                        UpdateExpression='SET canonicalLoId = :canonical, updatedAt = :now',
                        ExpressionAttributeValues={
                            ':canonical': existing_canonical,
                            ':now': datetime.now().isoformat()
                        }
                    )
                else:
                    # Remove the field
                    try:
                        self.table.update_item(
                            Key={key_name: old_id},
                            UpdateExpression='REMOVE canonicalLoId SET updatedAt = :now',
                            ExpressionAttributeValues={
                                ':now': datetime.now().isoformat()
                            }
                        )
                    except:
                        # If remove fails, just update timestamp
                        self.table.update_item(
                            Key={key_name: old_id},
                            UpdateExpression='SET updatedAt = :now',
                            ExpressionAttributeValues={
                                ':now': datetime.now().isoformat()
                            }
                        )
                
                restored += 1

            except Exception as e:
                errors.append(f"{item.get('old_id', 'unknown')}: {e}")

        print(f"✅ Restored {restored} items")
        if errors:
            print(f"❌ Errors: {len(errors)}")
            for err in errors[:5]:
                print(f"  - {err}")


def main():
    parser = argparse.ArgumentParser(description='LO ID Cleanup Tool')
    parser.add_argument('--dry-run', action='store_true', help='Report only')
    parser.add_argument('--apply', action='store_true', help='Apply fixes')
    parser.add_argument('--force', action='store_true', help='Skip confirmation')
    parser.add_argument('--rollback', type=str, help='Restore from backup')
    parser.add_argument('--report-file', type=str, help='Save report')
    parser.add_argument('--table-name', type=str, default=TABLE_NAME)
    parser.add_argument('--region', type=str, default=AWS_REGION)

    args = parser.parse_args()

    cleaner = LOIDCleaner(args.table_name, args.region)

    if args.rollback:
        cleaner.rollback(args.rollback)
        return

    # Scan and analyze
    los = cleaner.scan_all_los()
    categories = cleaner.analyze_lo_ids(los)

    # Generate report
    report = cleaner.generate_report(categories, args.report_file)
    print(report)

    # Apply or dry-run
    if args.apply:
        result = cleaner.apply_fixes(categories, dry_run=False, force=args.force)
    else:
        result = cleaner.apply_fixes(categories, dry_run=True)
        print("\n💡 Use --apply to apply fixes (with confirmation)")
        print("   Or --apply --force to skip confirmation (not recommended)")

    # Save JSON report
    json_file = args.report_file.replace('.txt', '.json') if args.report_file else 'cleanup_report.json'
    with open(json_file, 'w') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'categories': {k: len(v) if isinstance(v, list) else v for k, v in categories.items()},
            'fixes': result
        }, f, indent=2, default=str)
    print(f"📊 Full data saved to: {json_file}")


if __name__ == '__main__':
    main()
