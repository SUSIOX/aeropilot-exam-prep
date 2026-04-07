#!/usr/bin/env python3
"""
EASA Syllabus Audit Tool - SAFE VERSION with Database Protection
===============================================================

SAFETY FEATURES:
1. DEFAULT DRY-RUN: Without --apply, no changes are made
2. BACKUP CREATION: Automatically backs up affected rows before any changes
3. BATCH LIMITS: Max 25 items per DynamoDB batch (API limit)
4. CONFIRMATION: --apply requires explicit user confirmation
5. ROLLBACK LOG: Generates rollback_*.json with original values
6. ERROR HANDLING: Try/except on every DB operation

Usage:
    python audit_syllabus.py              # Safe dry-run mode (default)
    python audit_syllabus.py --dry-run    # Explicit dry-run
    python audit_syllabus.py --apply      # Apply fixes (requires confirmation)
    python audit_syllabus.py --apply --force  # Skip confirmation (dangerous!)
    python audit_syllabus.py --report-file audit_report.json

Mapping Rules:
    PPL(A) column checked -> tags: ["PPL(A)", "LAPL(A)"]
    PPL(H) column checked -> tags: ["PPL(H)", "LAPL(H)"]
    SPL column checked   -> tags: ["SPL", "LAPL(S)"]
    BPL column checked   -> tags: ["BPL", "LAPL(B)"]
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Set, Tuple, Optional

import boto3
import pdfplumber
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from tqdm import tqdm

# Load environment variables
load_dotenv()

# Configuration
PDF_PATH = os.getenv('PDF_PATH', '../public/ECQB-PPL-DetailedSyllabus.pdf')
TABLE_NAME = os.getenv('DYNAMODB_TABLE', 'aeropilot-easa-objectives')
AWS_REGION = os.getenv('AWS_REGION', 'eu-central-1')
BACKUP_DIR = os.getenv('BACKUP_DIR', './backups')

# Column mapping from PDF to tags (includes LAPL variants)
COLUMN_TO_TAGS = {
    'PPL(A)': ['PPL(A)', 'LAPL(A)'],
    'PPL(H)': ['PPL(H)', 'LAPL(H)'],
    'SPL': ['SPL', 'LAPL(S)'],
    'BPL': ['BPL', 'LAPL(B)'],
}

# Legacy tag normalization
LEGACY_TAG_MAP = {
    'PPL': 'PPL(A)',  # Will need manual review for helicopter
    'LAPL': 'LAPL(A)',  # Default to LAPL(A), manual review needed
}


def normalize_lo_id(lo_id: str) -> str:
    """
    Normalize LO ID to standard format for comparison.
    Handles: 10.1.1.1.1 -> 010.01.01.01.01 (always 5 parts, 3-digit subject)
    """
    if not lo_id:
        return lo_id
    
    parts = lo_id.split('.')
    if len(parts) >= 4:
        # Ensure subject (first part) is 3 digits
        subject = parts[0].zfill(3)
        # Ensure remaining parts are 2 digits each
        rest = [p.zfill(2) for p in parts[1:]]
        return '.'.join([subject] + rest)
    return lo_id


class DatabaseSafetyError(Exception):
    """Raised when a safety check fails."""
    pass


class PDFSyllabusParser:
    """Parse ECQB-PPL PDF and extract LO ID -> tags mapping."""

    # LO ID patterns: XXX.XX.XX.XX (010.01.01.01) or X.X.X.X.X (10.1.1.1.1) or XX.X.X.X.X (10.3.1.1.2)
    LO_ID_PATTERNS = [
        re.compile(r'(\d{3}\.\d{2}\.\d{2}\.\d{2})'),  # 010.01.01.01
        re.compile(r'(\d{1,2}\.\d{1,2}\.\d{1,2}\.\d{1,2}\.\d{1,2})'),  # 10.1.1.1.1 or 10.3.1.1.2
    ]

    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.lo_tags: Dict[str, Set[str]] = defaultdict(set)
        self.raw_data: List[Dict] = []  # For debugging

    def parse(self) -> Dict[str, List[str]]:
        """Parse PDF and return mapping of LO ID to list of tags."""
        print(f"📖 Parsing PDF: {self.pdf_path}")

        if not os.path.exists(self.pdf_path):
            print(f"❌ PDF not found: {self.pdf_path}")
            sys.exit(1)

        with pdfplumber.open(self.pdf_path) as pdf:
            for page_num, page in enumerate(tqdm(pdf.pages, desc="Pages"), 1):
                self._process_page(page, page_num)

        # Convert sets to sorted lists
        result = {lo_id: sorted(list(tags)) for lo_id, tags in self.lo_tags.items()}
        print(f"✅ Parsed {len(result)} unique LO IDs from PDF")
        return result

    def _process_page(self, page, page_num: int):
        """Process a single PDF page."""
        tables = page.extract_tables()

        for table in tables:
            if not table or len(table) < 2:
                continue

            # Find header row with column names
            header_idx = self._find_header_row(table)
            if header_idx is None:
                continue

            header = table[header_idx]
            col_indices = self._map_columns(header)

            if not col_indices:
                continue  # No relevant columns found

            # Process data rows
            for row in table[header_idx + 1:]:
                self._process_row(row, col_indices, page_num)

    def _find_header_row(self, table: List[List]) -> int:
        """Find row containing column headers."""
        for i, row in enumerate(table):
            if not row:
                continue
            row_text = ' '.join(str(cell or '') for cell in row).upper()
            # Look for Chapter column and license columns
            if 'CHAPTER' in row_text and any(col in row_text for col in ['PPL(A)', 'PPL(H)', 'SPL', 'BPL']):
                return i
        return None

    def _map_columns(self, header: List) -> Dict[str, int]:
        """Map column names to indices."""
        mapping = {}
        header_str = [str(h or '').upper().strip() for h in header]

        for i, h in enumerate(header_str):
            if 'CHAPTER' in h:
                mapping['lo_id'] = i  # Chapter column contains LO IDs
            elif 'PPL(A)' in h:
                mapping['PPL(A)'] = i
            elif 'PPL(H)' in h:
                mapping['PPL(H)'] = i
            elif h == 'SPL':
                mapping['SPL'] = i
            elif h == 'BPL':
                mapping['BPL'] = i

        return mapping

    def _process_row(self, row: List, col_indices: Dict[str, int], page_num: int):
        """Process a single table row."""
        # Extract LO ID from Chapter column
        if 'lo_id' not in col_indices:
            return

        lo_id_cell = row[col_indices['lo_id']] if col_indices['lo_id'] < len(row) else ''
        lo_id_str = str(lo_id_cell or '').strip()

        # Try to match LO ID with various patterns
        lo_id = None
        for pattern in self.LO_ID_PATTERNS:
            match = pattern.search(lo_id_str)
            if match:
                lo_id = match.group(1)
                break

        if not lo_id:
            return

        # Skip rows that are just subject headers (like "AIR LAW AND ATC PROCEDURES")
        if len(lo_id.split('.')) < 4:
            return

        # Check each license column
        for col_name, col_idx in col_indices.items():
            if col_name == 'lo_id':
                continue

            if col_idx >= len(row):
                continue

            cell_value = str(row[col_idx] or '').strip().upper()

            # Check if marked (x, X, or other common markers)
            # Also handle '-' which means explicitly NOT marked for SPL/BPL in some rows
            is_marked = cell_value and cell_value not in ['', '-', 'N/A', 'NA', 'NO', 'FALSE', '0']

            if is_marked:
                tags = COLUMN_TO_TAGS.get(col_name, [col_name])
                self.lo_tags[lo_id].update(tags)

        # Store raw data for debugging
        self.raw_data.append({
            'page': page_num,
            'lo_id': lo_id,
            'row': row,
            'tags': list(self.lo_tags[lo_id])
        })


class DynamoDBAuditor:
    """Audit and update DynamoDB EASA_OBJECTIVES table with safety features."""

    def __init__(self, table_name: str, region: str = 'eu-central-1'):
        self.table_name = table_name
        self.dynamodb = boto3.resource('dynamodb', region_name=region)
        self.table = self.dynamodb.Table(table_name)
        self.client = boto3.client('dynamodb', region_name=region)
        self.backup_data: Dict[str, Dict] = {}  # Store original values for rollback

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

    def compare_with_pdf(self, pdf_mapping: Dict[str, List[str]], db_los: List[Dict]) -> Dict:
        """Compare PDF mapping with database and find mismatches."""
        mismatches = {
            'missing_in_db': [],          # LO in PDF but not in DB
            'missing_tags': [],           # LO has fewer tags than PDF
            'extra_tags': [],             # LO has more tags than PDF
            'wrong_tags': [],               # LO has different tags
            'legacy_ppl': [],              # Uses legacy 'PPL' tag
            'ok': [],                      # Matches perfectly
            'total_pdf_los': len(pdf_mapping),
            'total_db_los': len(db_los),
        }

        # Normalize PDF LO IDs and build lookup
        normalized_pdf_mapping = {}
        for lo_id, tags in pdf_mapping.items():
            normalized_id = normalize_lo_id(lo_id)
            normalized_pdf_mapping[normalized_id] = tags

        # Build DB lookup by canonicalLoId or normalized loId
        db_by_id = {}
        for lo in db_los:
            raw_id = lo.get('loId', lo.get('losid', ''))
            canonical_id = lo.get('canonicalLoId')
            
            # Use canonicalLoId if available, otherwise normalize the raw ID
            lookup_key = canonical_id if canonical_id else normalize_lo_id(raw_id)
            
            if lookup_key:
                db_by_id[lookup_key] = lo
            # Also store by raw ID for fallback
            if raw_id:
                db_by_id[raw_id] = lo

        # Check each PDF LO
        for lo_id, expected_tags in normalized_pdf_mapping.items():
            if lo_id not in db_by_id:
                mismatches['missing_in_db'].append({
                    'lo_id': lo_id,
                    'expected_tags': expected_tags
                })
                continue

            db_lo = db_by_id[lo_id]
            
            # Get the actual primary key from the database item
            actual_key = db_lo.get('loId', db_lo.get('losid', ''))
            
            actual_tags = db_lo.get('appliesTo', db_lo.get('applies_to', []))

            # Normalize tags
            actual_set = set(str(t) for t in actual_tags)
            expected_set = set(expected_tags)

            # Check for legacy PPL tag
            has_legacy = 'PPL' in actual_set and 'PPL(A)' not in actual_set and 'PPL(H)' not in actual_set

            if has_legacy:
                mismatches['legacy_ppl'].append({
                    'lo_id': lo_id,
                    'actual_key': actual_key,  # Store actual DB key for updates
                    'current_tags': sorted(actual_tags),
                    'suggested_fix': [t if t != 'PPL' else 'PPL(A)' for t in actual_tags]
                })

            # Compare tags
            missing = expected_set - actual_set
            extra = actual_set - expected_set

            if not missing and not extra:
                mismatches['ok'].append({
                    'lo_id': lo_id,
                    'tags': sorted(actual_tags)
                })
            elif missing and not extra:
                mismatches['missing_tags'].append({
                    'lo_id': lo_id,
                    'actual_key': actual_key,  # Store actual DB key for updates
                    'current_tags': sorted(actual_tags),
                    'expected_tags': sorted(expected_set),
                    'missing': sorted(missing)
                })
            elif extra and not missing:
                mismatches['extra_tags'].append({
                    'lo_id': lo_id,
                    'actual_key': actual_key,
                    'current_tags': sorted(actual_tags),
                    'expected_tags': sorted(expected_set),
                    'extra': sorted(extra)
                })
            else:
                mismatches['wrong_tags'].append({
                    'lo_id': lo_id,
                    'actual_key': actual_key,
                    'current_tags': sorted(actual_tags),
                    'expected_tags': sorted(expected_set),
                    'missing': sorted(missing),
                    'extra': sorted(extra)
                })

        # Check for LOs in DB but not in PDF (orphaned)
        pdf_ids = set(normalized_pdf_mapping.keys())
        orphaned = []
        for lo_id, db_lo in db_by_id.items():
            if lo_id not in pdf_ids and lo_id:
                orphaned.append({
                    'lo_id': lo_id,
                    'current_tags': db_lo.get('appliesTo', db_lo.get('applies_to', []))
                })
        mismatches['orphaned_in_db'] = orphaned

        return mismatches

    def generate_report(self, mismatches: Dict, output_file: str = None) -> str:
        """Generate human-readable report."""
        lines = []
        lines.append("=" * 80)
        lines.append("EASA SYLLABUS AUDIT REPORT")
        lines.append(f"Generated: {datetime.now().isoformat()}")
        lines.append("=" * 80)
        lines.append("")

        # Summary
        total_ok = len(mismatches['ok'])
        total_issues = (
            len(mismatches['missing_in_db']) +
            len(mismatches['missing_tags']) +
            len(mismatches['extra_tags']) +
            len(mismatches['wrong_tags']) +
            len(mismatches['legacy_ppl'])
        )

        lines.append("SUMMARY")
        lines.append("-" * 40)
        lines.append(f"PDF LOs analyzed: {mismatches['total_pdf_los']}")
        lines.append(f"DB LOs scanned:   {mismatches['total_db_los']}")
        lines.append(f"Perfect match:    {total_ok}")
        lines.append(f"Issues found:     {total_issues}")
        lines.append(f"Orphaned in DB:   {len(mismatches.get('orphaned_in_db', []))}")
        lines.append("")

        # Detailed findings
        sections = [
            ('❌ LO in PDF but MISSING in DB', 'missing_in_db', ['expected_tags']),
            ('⚠️  LO with MISSING TAGS', 'missing_tags', ['current_tags', 'expected_tags', 'missing']),
            ('⚠️  LO with EXTRA TAGS', 'extra_tags', ['current_tags', 'expected_tags', 'extra']),
            ('❌ LO with WRONG TAGS', 'wrong_tags', ['current_tags', 'expected_tags', 'missing', 'extra']),
            ('🔄 LO with LEGACY "PPL" TAG', 'legacy_ppl', ['current_tags', 'suggested_fix']),
        ]

        for title, key, fields in sections:
            items = mismatches.get(key, [])
            if not items:
                continue

            lines.append(title)
            lines.append("-" * 40)
            for item in items[:20]:  # Limit to 20 examples
                lines.append(f"  LO ID: {item['lo_id']}")
                for field in fields:
                    lines.append(f"    {field}: {item.get(field, 'N/A')}")
                lines.append("")

            if len(items) > 20:
                lines.append(f"  ... and {len(items) - 20} more")
                lines.append("")

        # Orphaned
        orphaned = mismatches.get('orphaned_in_db', [])
        if orphaned:
            lines.append('🗑️  LO in DB but NOT in PDF (orphaned)')
            lines.append("-" * 40)
            for item in orphaned[:10]:
                lines.append(f"  {item['lo_id']}: {item['current_tags']}")
            if len(orphaned) > 10:
                lines.append(f"  ... and {len(orphaned) - 10} more")
            lines.append("")

        report = '\n'.join(lines)

        if output_file:
            with open(output_file, 'w') as f:
                f.write(report)
            print(f"📝 Report saved to: {output_file}")

        return report

    def _confirm_apply(self, total_fixes: int, force: bool = False) -> bool:
        """Ask for user confirmation before applying changes."""
        if force:
            print("⚠️  FORCE MODE: Skipping confirmation (DANGEROUS!)")
            return True

        print(f"\n{'='*60}")
        print("⚠️  WARNING: You are about to modify the database!")
        print(f"   Table: {self.table_name}")
        print(f"   Items to update: {total_fixes}")
        print(f"{'='*60}")
        print("\nThis will:")
        print("  1. Create a backup of affected rows")
        print("  2. Update appliesTo tags in DynamoDB")
        print("  3. Set updatedAt timestamp")
        print("\nType 'YES' to proceed, or anything else to cancel:")

        try:
            response = input("> ").strip()
            return response == "YES"
        except (EOFError, KeyboardInterrupt):
            print("\n❌ Cancelled")
            return False

    def _create_backup(self, fixes: List[Dict], db_by_id: Dict[str, Dict]) -> str:
        """Create backup of affected rows before modification."""
        os.makedirs(BACKUP_DIR, exist_ok=True)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = os.path.join(BACKUP_DIR, f'rollback_{timestamp}.json')

        backup_data = []
        for fix in fixes:
            lo_id = fix['lo_id']
            if lo_id in db_by_id:
                backup_data.append({
                    'lo_id': lo_id,
                    'original_data': db_by_id[lo_id],
                    'reason': fix['reason'],
                    'new_tags': fix['new_tags']
                })

        with open(backup_file, 'w') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'table': self.table_name,
                'count': len(backup_data),
                'items': backup_data
            }, f, indent=2, default=str)

        print(f"💾 Backup created: {backup_file}")
        return backup_file

    def _restore_from_backup(self, backup_file: str) -> int:
        """Restore database from backup file."""
        print(f"🔄 Restoring from: {backup_file}")

        with open(backup_file, 'r') as f:
            backup = json.load(f)

        restored = 0
        errors = []

        for item in tqdm(backup['items'], desc="Restoring"):
            try:
                lo_id = item['lo_id']
                original = item['original_data']

                # Determine key name
                if 'loId' in original:
                    key_name = 'loId'
                else:
                    key_name = 'losid'

                # Restore original appliesTo
                original_tags = original.get('appliesTo', original.get('applies_to', []))

                self.table.update_item(
                    Key={key_name: lo_id},
                    UpdateExpression='SET appliesTo = :tags, updatedAt = :now',
                    ExpressionAttributeValues={
                        ':tags': original_tags,
                        ':now': datetime.now().isoformat()
                    }
                )
                restored += 1

            except Exception as e:
                errors.append(f"{item.get('lo_id', 'unknown')}: {e}")

        print(f"✅ Restored {restored} items")
        if errors:
            print(f"❌ Errors: {len(errors)}")
            for err in errors[:5]:
                print(f"  - {err}")

        return restored

    def apply_fixes(self, mismatches: Dict, pdf_mapping: Dict[str, List[str]], 
                    dry_run: bool = True, force: bool = False) -> Dict:
        """Apply fixes to database with safety checks."""
        mode = "DRY RUN" if dry_run else "APPLYING"
        print(f"\n🔧 {mode} FIXES")
        print("-" * 40)

        fixes_applied = 0
        errors = []

        # Normalize PDF mapping
        normalized_pdf_mapping = {}
        for lo_id, tags in pdf_mapping.items():
            normalized_id = normalize_lo_id(lo_id)
            normalized_pdf_mapping[normalized_id] = tags

        # Build list of items to fix
        to_fix = []

        # Fix missing tags
        for item in mismatches.get('missing_tags', []):
            lo_id = item['lo_id']
            actual_key = item.get('actual_key', lo_id)  # Use actual_key if available
            to_fix.append({
                'lo_id': lo_id,
                'actual_key': actual_key,  # Store actual DB key for update
                'new_tags': normalized_pdf_mapping.get(lo_id, item['expected_tags']),
                'reason': 'missing_tags'
            })

        # Fix wrong tags
        for item in mismatches.get('wrong_tags', []):
            lo_id = item['lo_id']
            actual_key = item.get('actual_key', lo_id)  # Use actual_key if available
            to_fix.append({
                'lo_id': lo_id,
                'actual_key': actual_key,  # Store actual DB key for update
                'new_tags': normalized_pdf_mapping.get(lo_id, item['expected_tags']),
                'reason': 'wrong_tags'
            })

        # Fix legacy PPL tags
        for item in mismatches.get('legacy_ppl', []):
            lo_id = item['lo_id']
            actual_key = item.get('actual_key', lo_id)  # Use actual_key if available
            
            # Replace PPL with PPL(A) while keeping other tags
            current_tags = set(item['current_tags'])
            if 'PPL' in current_tags:
                current_tags.discard('PPL')
                current_tags.add('PPL(A)')
            to_fix.append({
                'lo_id': lo_id,
                'actual_key': actual_key,  # Store actual DB key
                'new_tags': sorted(list(current_tags)),
                'reason': 'legacy_ppl'
            })

        if not to_fix:
            print("✅ No fixes needed!")
            return {'applied': 0, 'errors': [], 'backup_file': None}

        print(f"Found {len(to_fix)} items to fix")

        # DRY RUN MODE
        if dry_run:
            print("\n[DRY RUN - No changes will be made]")
            for fix in to_fix[:10]:
                print(f"  Would update {fix['lo_id']}: {fix['new_tags']} ({fix['reason']})")
            if len(to_fix) > 10:
                print(f"  ... and {len(to_fix) - 10} more")
            return {'applied': 0, 'errors': [], 'backup_file': None, 'planned': len(to_fix)}

        # APPLY MODE - Safety checks
        # 1. Get confirmation
        if not self._confirm_apply(len(to_fix), force):
            print("❌ Cancelled by user")
            return {'applied': 0, 'errors': [], 'backup_file': None}

        # 2. Create backup
        db_by_id = {}  # Need to fetch fresh data for backup
        for fix in to_fix:
            try:
                # Try loId first
                result = self.table.get_item(Key={'loId': fix['lo_id']})
                if 'Item' in result:
                    db_by_id[fix['lo_id']] = result['Item']
                else:
                    # Try losid
                    result = self.table.get_item(Key={'losid': fix['lo_id']})
                    if 'Item' in result:
                        db_by_id[fix['lo_id']] = result['Item']
            except Exception as e:
                print(f"Warning: Could not fetch {fix['lo_id']}: {e}")

        backup_file = self._create_backup(to_fix, db_by_id)

        # 3. Apply fixes in batches of 25 (DynamoDB limit)
        batch_size = 25
        batches = [to_fix[i:i + batch_size] for i in range(0, len(to_fix), batch_size)]

        print(f"\nApplying {len(to_fix)} fixes in {len(batches)} batches...")

        for batch_num, batch in enumerate(batches, 1):
            print(f"\nBatch {batch_num}/{len(batches)}:")

            for fix in tqdm(batch, desc=f"Batch {batch_num}"):
                lo_id = fix['lo_id']
                actual_key = fix.get('actual_key', lo_id)  # Use actual DB key
                new_tags = fix['new_tags']

                try:
                    # Determine key name from actual_key format
                    if 'loId' in db_by_id.get(actual_key, {}):
                        key_name = 'loId'
                    elif 'losid' in db_by_id.get(actual_key, {}):
                        key_name = 'losid'
                    else:
                        # Try to fetch to determine key
                        result = self.table.get_item(Key={'loId': actual_key})
                        if 'Item' in result:
                            key_name = 'loId'
                        else:
                            key_name = 'losid'

                    # Update item using actual_key
                    self.table.update_item(
                        Key={key_name: actual_key},
                        UpdateExpression='SET appliesTo = :tags, updatedAt = :now',
                        ExpressionAttributeValues={
                            ':tags': new_tags,
                            ':now': datetime.now().isoformat()
                        }
                    )
                    fixes_applied += 1

                except ClientError as e:
                    errors.append(f"{actual_key}: DynamoDB error - {e}")
                except Exception as e:
                    errors.append(f"{actual_key}: {e}")

        # Summary
        print(f"\n{'='*60}")
        print(f"✅ Fixes applied: {fixes_applied}/{len(to_fix)}")
        if errors:
            print(f"❌ Errors: {len(errors)}")
            for err in errors[:5]:
                print(f"  - {err}")
        print(f"💾 Backup saved: {backup_file}")
        print(f"\nTo rollback: python audit_syllabus.py --rollback {backup_file}")
        print(f"{'='*60}")

        return {
            'applied': fixes_applied,
            'errors': errors,
            'backup_file': backup_file,
            'total': len(to_fix)
        }


def main():
    parser = argparse.ArgumentParser(description='EASA Syllabus Audit Tool (Safe Version)')
    parser.add_argument('--dry-run', action='store_true', 
                        help='Report only, do not apply changes (default if no --apply)')
    parser.add_argument('--apply', action='store_true', 
                        help='Apply fixes to database (requires --force or manual YES)')
    parser.add_argument('--force', action='store_true', 
                        help='Skip confirmation prompt (DANGEROUS!)')
    parser.add_argument('--rollback', type=str, metavar='BACKUP_FILE',
                        help='Restore database from backup file')
    parser.add_argument('--report-file', type=str, 
                        help='Save detailed report to file')
    parser.add_argument('--pdf-path', type=str, default=PDF_PATH, 
                        help='Path to PDF file')
    parser.add_argument('--table-name', type=str, default=TABLE_NAME, 
                        help='DynamoDB table name')
    parser.add_argument('--region', type=str, default=AWS_REGION, 
                        help='AWS region')

    args = parser.parse_args()

    # Handle rollback mode first
    if args.rollback:
        auditor = DynamoDBAuditor(args.table_name, args.region)
        auditor._restore_from_backup(args.rollback)
        return

    # Default to dry-run if neither --apply nor --dry-run specified
    is_dry_run = not args.apply

    # Parse PDF
    pdf_parser = PDFSyllabusParser(args.pdf_path)
    pdf_mapping = pdf_parser.parse()

    # Connect to DynamoDB
    auditor = DynamoDBAuditor(args.table_name, args.region)

    # Scan database
    db_los = auditor.scan_all_los()

    # Compare
    mismatches = auditor.compare_with_pdf(pdf_mapping, db_los)

    # Generate report
    report = auditor.generate_report(mismatches, args.report_file)
    print(report)

    # Apply or dry-run
    if args.apply:
        result = auditor.apply_fixes(mismatches, pdf_mapping, dry_run=False, force=args.force)
    else:
        result = auditor.apply_fixes(mismatches, pdf_mapping, dry_run=True)
        print("\n💡 Use --apply to apply fixes (with confirmation)")
        print("   Or --apply --force to skip confirmation (not recommended)")

    # Save JSON report
    json_file = args.report_file.replace('.txt', '.json') if args.report_file else 'audit_report.json'
    report_data = {
        'timestamp': datetime.now().isoformat(),
        'mismatches': mismatches,
        'fixes': result
    }
    with open(json_file, 'w') as f:
        json.dump(report_data, f, indent=2, default=str)
    print(f"📊 Full data saved to: {json_file}")


if __name__ == '__main__':
    main()
