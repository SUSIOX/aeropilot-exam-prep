#!/usr/bin/env python3
"""
Porovná názvy obrázků v DynamoDB oproti S3 a opraví case-sensitivity problémy.

Použití:
  python3 tools/fix_s3_case_dynamo.py          # pouze report
  python3 tools/fix_s3_case_dynamo.py --fix     # opraví přímo v DynamoDB
"""

import boto3
import sys
from decimal import Decimal

REGION = "eu-central-1"
TABLE_NAME = "aeropilot-questions"
S3_BUCKET = "aeropilotexam"
S3_PREFIX = "questions/"

dynamodb = boto3.resource("dynamodb", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)


def get_s3_images() -> dict[str, str]:
    """Vrátí slovník {lowercase_name -> actual_s3_name} pro všechny soubory v S3."""
    images = {}
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=S3_PREFIX):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            filename = key[len(S3_PREFIX):]  # odstraní prefix
            if filename and "." in filename:
                images[filename.lower()] = filename
    print(f"📦 S3: nalezeno {len(images)} obrázků v s3://{S3_BUCKET}/{S3_PREFIX}")
    return images


def scan_all_questions() -> list[dict]:
    """Načte všechny otázky z DynamoDB (s paginací)."""
    items = []
    response = table.scan(ProjectionExpression="questionId, image")
    items.extend(response.get("Items", []))
    while "LastEvaluatedKey" in response:
        response = table.scan(
            ProjectionExpression="questionId, image",
            ExclusiveStartKey=response["LastEvaluatedKey"],
        )
        items.extend(response.get("Items", []))
    print(f"📊 DynamoDB: načteno {len(items)} otázek")
    return items


def find_mismatches(questions: list[dict], s3_images: dict[str, str]) -> list[dict]:
    """Najde otázky kde image v DB neodpovídá skutečnému jménu v S3."""
    issues = []
    for q in questions:
        db_image = q.get("image")
        if not db_image:
            continue
        s3_actual = s3_images.get(db_image.lower())
        if s3_actual and s3_actual != db_image:
            issues.append({
                "questionId": q["questionId"],
                "db_image": db_image,
                "s3_image": s3_actual,
            })
    return issues


def fix_mismatches(issues: list[dict]) -> None:
    """Opraví image pole v DynamoDB pro všechny nalezené problémy."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()

    for i, issue in enumerate(issues, 1):
        qid = issue["questionId"]
        correct = issue["s3_image"]
        print(f"  [{i}/{len(issues)}] Opravuji {qid}: {issue['db_image']} -> {correct}")
        table.update_item(
            Key={"questionId": qid},
            UpdateExpression="SET image = :img, updatedAt = :ts",
            ExpressionAttributeValues={":img": correct, ":ts": now},
        )
    print(f"\n✅ Opraveno {len(issues)} položek")


def main():
    fix_mode = "--fix" in sys.argv

    print("=" * 60)
    print("KONTROLA CASE-SENSITIVITY: DynamoDB vs S3")
    print("=" * 60)

    s3_images = get_s3_images()
    questions = scan_all_questions()
    issues = find_mismatches(questions, s3_images)

    print()
    if not issues:
        print("✅ Žádné case-sensitivity problémy nenalezeny!")
        return 0

    print(f"⚠️  Nalezeno {len(issues)} problémů:")
    print("-" * 60)
    for issue in issues:
        print(f"  {issue['questionId']}: DB={issue['db_image']}  S3={issue['s3_image']}")

    if fix_mode:
        print()
        print("🔧 Opravuji DynamoDB...")
        fix_mismatches(issues)
    else:
        print()
        print("ℹ️  Spusť s --fix pro automatickou opravu:")
        print("   python3 tools/fix_s3_case_dynamo.py --fix")

    return 0


if __name__ == "__main__":
    sys.exit(main())
