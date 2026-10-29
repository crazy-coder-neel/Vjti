#!/usr/bin/env python3
"""SpoonSense - Standalone Test Email Dispatcher

Usage:
    python backend/scripts/send_test_email.py
    python backend/scripts/send_test_email.py --to professor@vjti.ac.in --type extension_request
    python backend/scripts/send_test_email.py --to student@vjti.ac.in --type spoon_checkin
"""

import argparse
import json
import os
import sys

# Ensure backend root is on python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.email_service import send_test_email, get_smtp_config


def main():
    parser = argparse.ArgumentParser(description="Dispatch a test email via SpoonSense.")
    parser.add_argument("--to", default="student@spoonsense.dev", help="Recipient email address")
    parser.add_argument(
        "--type",
        choices=["test_ping", "extension_request", "spoon_checkin"],
        default="test_ping",
        help="Type of test email to send",
    )
    parser.add_argument("--student", default="Alex Morgan", help="Student name")
    parser.add_argument("--course", default="CS301 Distributed Systems", help="Course name")
    parser.add_argument("--assignment", default="Milestone 2 Architecture", help="Assignment name")
    parser.add_argument("--professor", default="Prof. Sharma", help="Professor name")
    args = parser.parse_args()

    config = get_smtp_config()
    is_live = bool(config["host"] and config["user"] and config["password"])

    print("=" * 60)
    print(" SpoonSense Email Dispatch Utility")
    print("=" * 60)
    print(f" Mode: {'[LIVE SMTP]' if is_live else '[SAFE SIMULATED DISPATCH]'}")
    if is_live:
        print(f" SMTP Server: {config['host']}:{config['port']}")
        print(f" From: {config['from_email']}")
    else:
        print(" Note: SMTP credentials not set; capturing email in test logs.")
    print("-" * 60)
    print(f" Dispatching '{args.type}' email to: {args.to}")

    result = send_test_email(
        to_email=args.to,
        email_type=args.type,
        student_name=args.student,
        course_name=args.course,
        assignment_title=args.assignment,
        professor_name=args.professor,
    )

    print("\n✅ Email Dispatched Successfully!")
    print(f" Status: {result.get('status')}")
    print(f" Subject: {result.get('subject')}")
    print(f" Message ID: {result.get('id')}")
    print("\n--- Message Preview ---")
    print(result.get("body", ""))
    print("-" * 60)


if __name__ == "__main__":
    main()
