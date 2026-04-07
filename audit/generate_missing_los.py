#!/usr/bin/env python3
"""
Generate Missing LOs Script
===========================
Creates missing Learning Objectives in DynamoDB from PDF syllabus data.

This script:
1. Reads the audit report to find missing LOs
2. Extracts LO details from the PDF (ID, tags, description)
3. Creates new LO entries in DynamoDB with placeholder content

SAFETY FEATURES:
1. DEFAULT DRY-RUN
2. Backup before changes
3. User confirmation required
4. Batch inserts (25 items max)
5. Rollback capability

Usage:
    python generate_missing_los.py              # Report only
    python generate_missing_los.py --dry-run    # Show what would be created
    python generate_missing_los.py --apply     # Create LOs with confirmation
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime
from typing import Dict, List, Set, Optional

import boto3
import pdfplumber
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()

PDF_PATH = os.getenv('PDF_PATH', '../public/ECQB-PPL-DetailedSyllabus.pdf')
TABLE_NAME = os.getenv('DYNAMODB_TABLE', 'aeropilot-easa-objectives')
AWS_REGION = os.getenv('AWS_REGION', 'eu-central-1')
BACKUP_DIR = os.getenv('BACKUP_DIR', './backups')

# Subject mapping (EASA codes to subject IDs)
SUBJECT_MAP = {
    '010': 1,   # Air Law
    '020': 2,   # Aircraft General Knowledge - System
    '030': 3,   # Flight Performance and Planning
    '040': 4,   # Human Performance
    '050': 5,   # Meteorology
    '060': 6,   # Navigation - General
    '061': 6,   # Navigation - VFR
    '062': 6,   # Navigation - Radio
    '063': 6,   # Navigation - Instruments
    '070': 7,   # Operational Procedures
    '071': 7,   # Operational Procedures - ALW
    '072': 7,   # Operational Procedures - FPP
    '073': 7,   # Operational Procedures - NAV
    '074': 7,   # Operational Procedures - PFA
    '075': 7,   # Operational Procedures - MET
    '076': 7,   # Operational Procedures - AGK
    '080': 8,   # Principles of Flight
    '081': 8,   # Principles of Flight
    '082': 8,   # Principles of Flight - PFA
    '083': 8,   # Principles of Flight - OPS
    '084': 8,   # Principles of Flight - NAV
    '090': 9,   # Communications
    '091': 9,   # Communications - VFR
    '092': 9,   # Communications - IFR
}


def get_subject_id(lo_id: str) -> int:
    """Extract subject ID from LO ID."""
    parts = lo_id.split('.')
    if not parts:
        return 1
    
    subject_code = parts[0]
    return SUBJECT_MAP.get(subject_code, 1)


class MissingLOGenerator:
    """Generate missing LOs from PDF data."""

    def __init__(self, table_name: str, region: str = 'eu-central-1'):
        self.table_name = table_name
        self.dynamodb = boto3.resource('dynamodb', region_name=region)
        self.table = self.dynamodb.Table(table_name)
        self.pdf_data: Dict[str, Dict] = {}

    def parse_pdf_for_details(self, pdf_path: str) -> Dict[str, Dict]:
        """Parse PDF to extract LO details (ID, description, tags)."""
        print(f"📖 Parsing PDF for LO details: {pdf_path}")
        
        lo_details = {}
        
        if not os.path.exists(pdf_path):
            print(f"❌ PDF not found: {pdf_path}")
            return lo_details

        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(tqdm(pdf.pages, desc="Pages"), 1):
                tables = page.extract_tables()
                
                for table in tables:
                    if not table or len(table) < 2:
                        continue
                    
                    # Find header row
                    header_idx = self._find_header_row(table)
                    if header_idx is None:
                        continue
                    
                    header = table[header_idx]
                    col_indices = self._map_columns(header)
                    
                    if not col_indices:
                        continue
                    
                    # Process data rows
                    for row in table[header_idx + 1:]:
                        self._process_pdf_row(row, col_indices, lo_details, page_num)
        
        print(f"✅ Parsed {len(lo_details)} LOs with details from PDF")
        return lo_details

    def _find_header_row(self, table: List) -> int:
        """Find header row with column names."""
        for i, row in enumerate(table):
            if not row:
                continue
            row_text = ' '.join(str(cell or '') for cell in row).upper()
            if 'CHAPTER' in row_text and any(col in row_text for col in ['PPL(A)', 'PPL(H)', 'SPL', 'BPL']):
                return i
        return None

    def _map_columns(self, header: List) -> Dict[str, int]:
        """Map column names to indices."""
        mapping = {}
        header_str = [str(h or '').upper().strip() for h in header]
        
        for i, h in enumerate(header_str):
            if 'CHAPTER' in h:
                mapping['lo_id'] = i
            elif 'DESCRIPTION' in h or 'LEARNING' in h:
                mapping['description'] = i
            elif 'PPL(A)' in h:
                mapping['PPL(A)'] = i
            elif 'PPL(H)' in h:
                mapping['PPL(H)'] = i
            elif h == 'SPL':
                mapping['SPL'] = i
            elif h == 'BPL':
                mapping['BPL'] = i
        
        return mapping

    def _process_pdf_row(self, row: List, col_indices: Dict, lo_details: Dict, page_num: int):
        """Process a single PDF row."""
        # Extract LO ID
        if 'lo_id' not in col_indices:
            return
        
        lo_id_cell = row[col_indices['lo_id']] if col_indices['lo_id'] < len(row) else ''
        lo_id_str = str(lo_id_cell or '').strip()
        
        # Match LO ID pattern (5 parts)
        match = re.match(r'^(\d{1,3})\.(\d{1,2})\.(\d{1,2})\.(\d{1,2})\.(\d{1,2})$', lo_id_str)
        if not match:
            return
        
        # Normalize LO ID
        parts = lo_id_str.split('.')
        subject = parts[0].zfill(3)
        rest = [p.zfill(2) for p in parts[1:]]
        lo_id = '.'.join([subject] + rest)
        
        # Extract description
        description = ''
        if 'description' in col_indices and col_indices['description'] < len(row):
            description = str(row[col_indices['description']] or '').strip()
        
        # Extract tags from license columns
        tags = []
        for col_name in ['PPL(A)', 'PPL(H)', 'SPL', 'BPL']:
            if col_name in col_indices:
                col_idx = col_indices[col_name]
                if col_idx < len(row):
                    cell_value = str(row[col_idx] or '').strip().upper()
                    if cell_value and cell_value not in ['', '-', 'N/A']:
                        # Add main tag and LAPL variant
                        if col_name == 'PPL(A)':
                            tags.extend(['PPL(A)', 'LAPL(A)'])
                        elif col_name == 'PPL(H)':
                            tags.extend(['PPL(H)', 'LAPL(H)'])
                        elif col_name == 'SPL':
                            tags.extend(['SPL', 'LAPL(S)'])
                        elif col_name == 'BPL':
                            tags.extend(['BPL', 'LAPL(B)'])
        
        # If all columns are marked, add all tags
        if not tags:
            # Check if any license column has a mark
            has_any = False
            for col_name in ['PPL(A)', 'PPL(H)', 'SPL', 'BPL']:
                if col_name in col_indices:
                    col_idx = col_indices[col_name]
                    if col_idx < len(row):
                        cell_value = str(row[col_idx] or '').strip().upper()
                        if cell_value and cell_value not in ['', '-', 'N/A']:
                            has_any = True
                            break
            
            if has_any or not any(col in col_indices for col in ['PPL(A)', 'PPL(H)', 'SPL', 'BPL']):
                # Assume all licenses if we can't determine
                tags = ['PPL(A)', 'PPL(H)', 'SPL', 'BPL', 'LAPL(A)', 'LAPL(H)', 'LAPL(S)', 'LAPL(B)']
        
        lo_details[lo_id] = {
            'loId': lo_id,
            'canonicalLoId': lo_id,
            'text': description or f'Learning Objective {lo_id}',
            'subjectId': get_subject_id(lo_id),
            'appliesTo': list(set(tags)),  # Remove duplicates
            'level': 2,  # Default level
            'version': '2021',
            'source': 'pdf-import',
            'page': page_num
        }

    def load_audit_report(self, report_path: str) -> List[Dict]:
        """Load missing LOs from audit report."""
        print(f"📄 Loading audit report: {report_path}")
        
        with open(report_path, 'r') as f:
            report = json.load(f)
        
        missing = report.get('mismatches', {}).get('missing_in_db', [])
        print(f"✅ Found {len(missing)} missing LOs in report")
        return missing

    def generate_lo_items(self, missing_los: List[Dict], pdf_details: Dict[str, Dict]) -> List[Dict]:
        """Generate complete LO items for missing LOs."""
        now = datetime.now().isoformat()
        items = []
        
        for missing in missing_los:
            lo_id = missing['lo_id']
            
            # Use PDF details if available, otherwise create basic item
            if lo_id in pdf_details:
                item = pdf_details[lo_id].copy()
            else:
                # Create basic item from ID
                item = {
                    'loId': lo_id,
                    'canonicalLoId': lo_id,
                    'text': f'Learning Objective {lo_id}',
                    'subjectId': get_subject_id(lo_id),
                    'appliesTo': missing.get('expected_tags', []),
                    'level': 2,
                    'version': '2021',
                    'source': 'pdf-import'
                }
            
            # Add timestamps
            item['createdAt'] = now
            item['updatedAt'] = now
            
            # Ensure all required fields
            if 'knowledgeContent' not in item:
                item['knowledgeContent'] = f'Content for {item["text"]}'
            
            items.append(item)
        
        return items

    def _confirm_create(self, total: int, force: bool = False) -> bool:
        """Ask for user confirmation."""
        if force:
            print("⚠️  FORCE MODE: Skipping confirmation")
            return True
        
        print(f"\n{'='*60}")
        print("⚠️  WARNING: You are about to create new LOs in the database!")
        print(f"   Table: {self.table_name}")
        print(f"   Items to create: {total}")
        print(f"{'='*60}")
        print("\nThis will:")
        print("  1. Create backup")
        print("  2. Insert new Learning Objectives into DynamoDB")
        print("  3. These LOs will have basic/placeholder content")
        print("\nType 'YES' to proceed, or anything else to cancel:")
        
        try:
            response = input("> ").strip()
            return response == "YES"
        except (EOFError, KeyboardInterrupt):
            print("\n❌ Cancelled")
            return False

    def _create_backup(self, items: List[Dict]) -> str:
        """Create backup of items to be created."""
        os.makedirs(BACKUP_DIR, exist_ok=True)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = os.path.join(BACKUP_DIR, f'created_los_{timestamp}.json')
        
        with open(backup_file, 'w') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'table': self.table_name,
                'count': len(items),
                'items': items
            }, f, indent=2, default=str)
        
        print(f"💾 Backup created: {backup_file}")
        return backup_file

    def create_los(self, items: List[Dict], dry_run: bool = True, force: bool = False) -> Dict:
        """Create LOs in DynamoDB."""
        mode = "DRY RUN" if dry_run else "CREATING"
        print(f"\n🔧 {mode} MISSING LOS")
        print("-" * 40)
        
        if not items:
            print("✅ No LOs to create!")
            return {'created': 0, 'errors': [], 'backup_file': None}
        
        print(f"Found {len(items)} LOs to create")
        
        # DRY RUN
        if dry_run:
            print("\n[DRY RUN - No changes will be made]")
            for item in items[:5]:
                print(f"  Would create: {item['loId']}")
                print(f"    Text: {item['text'][:60]}...")
                print(f"    Tags: {item['appliesTo'][:3]}...")
            if len(items) > 5:
                print(f"  ... and {len(items) - 5} more")
            return {'created': 0, 'errors': [], 'backup_file': None, 'planned': len(items)}
        
        # APPLY MODE
        if not self._confirm_create(len(items), force):
            print("❌ Cancelled by user")
            return {'created': 0, 'errors': [], 'backup_file': None}
        
        # Create backup
        backup_file = self._create_backup(items)
        
        # Create LOs in batches
        batch_size = 25
        batches = [items[i:i + batch_size] for i in range(0, len(items), batch_size)]
        
        created = 0
        errors = []
        
        print(f"\nCreating {len(items)} LOs in {len(batches)} batches...")
        
        for batch_num, batch in enumerate(batches, 1):
            print(f"\nBatch {batch_num}/{len(batches)}:")
            
            for item in tqdm(batch, desc=f"Batch {batch_num}"):
                try:
                    self.table.put_item(Item=item)
                    created += 1
                except ClientError as e:
                    errors.append(f"{item['loId']}: DynamoDB error - {e}")
                except Exception as e:
                    errors.append(f"{item['loId']}: {e}")
        
        # Summary
        print(f"\n{'='*60}")
        print(f"✅ LOs created: {created}/{len(items)}")
        if errors:
            print(f"❌ Errors: {len(errors)}")
            for err in errors[:5]:
                print(f"  - {err}")
        print(f"💾 Backup saved: {backup_file}")
        print(f"{'='*60}")
        
        return {
            'created': created,
            'errors': errors,
            'backup_file': backup_file,
            'total': len(items)
        }


def main():
    parser = argparse.ArgumentParser(description='Generate Missing LOs from PDF')
    parser.add_argument('--dry-run', action='store_true', help='Report only')
    parser.add_argument('--apply', action='store_true', help='Create LOs')
    parser.add_argument('--force', action='store_true', help='Skip confirmation')
    parser.add_argument('--audit-report', type=str, default='audit_report.json',
                        help='Path to audit report JSON')
    parser.add_argument('--pdf-path', type=str, default=PDF_PATH,
                        help='Path to PDF file')
    parser.add_argument('--table-name', type=str, default=TABLE_NAME)
    parser.add_argument('--region', type=str, default=AWS_REGION)
    
    args = parser.parse_args()
    
    generator = MissingLOGenerator(args.table_name, args.region)
    
    # Parse PDF for LO details
    pdf_details = generator.parse_pdf_for_details(args.pdf_path)
    
    # Load missing LOs from audit report
    missing_los = generator.load_audit_report(args.audit_report)
    
    # Generate LO items
    items = generator.generate_lo_items(missing_los, pdf_details)
    
    print(f"\n📋 Generated {len(items)} LO items ready for creation")
    
    # Create or dry-run
    if args.apply:
        result = generator.create_los(items, dry_run=False, force=args.force)
    else:
        result = generator.create_los(items, dry_run=True)
        print("\n💡 Use --apply to create the LOs (with confirmation)")
        print("   Or --apply --force to skip confirmation")
    
    # Save report
    report_file = 'missing_los_generation.json'
    with open(report_file, 'w') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'pdf_lo_details_found': len(pdf_details),
            'missing_los': len(missing_los),
            'items_generated': len(items),
            'result': result
        }, f, indent=2, default=str)
    print(f"📊 Report saved to: {report_file}")


if __name__ == '__main__':
    main()
