"""SpoonSense Email Service (FEAT-C4 / Notification Dispatch)

Supports both real SMTP dispatch (via Gmail, Mailgun, SendGrid, etc.)
and safe zero-config simulated dispatch with in-memory logging.

Adheres strictly to the SpoonSense Zero-Shame philosophy:
- No clinical or diagnostic labels.
- Respectful, dignified framing around academic pacing and workload.
"""

from __future__ import annotations

import logging
import os
import smtplib
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List, Optional

logger = logging.getLogger("spoonsense.email")

# In-memory storage for sent emails (accessible for test verification and demo inspect)
_SENT_EMAIL_LOG: List[Dict[str, Any]] = []


def get_smtp_config() -> Dict[str, Any]:
    """Retrieve SMTP configuration from environment variables."""
    return {
        "host": os.getenv("SMTP_HOST", "").strip(),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": os.getenv("SMTP_USER", "").strip(),
        "password": os.getenv("SMTP_PASSWORD", "").strip(),
        "from_email": os.getenv("SMTP_FROM_EMAIL", "").strip() or os.getenv("SMTP_USER", "").strip() or "notifications@spoonsense.dev",
        "use_tls": os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes"),
        "use_ssl": os.getenv("SMTP_USE_SSL", "false").lower() in ("true", "1", "yes"),
    }


def send_email(
    to_email: str,
    subject: str,
    body: str,
    html_body: Optional[str] = None,
    from_name: str = "SpoonSense",
) -> Dict[str, Any]:
    """Send an email using SMTP if configured, or simulate safely.

    Returns:
        Dict containing status, mode, recipient, message_id, timestamp, and details.
    """
    msg_id = f"msg_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    config = get_smtp_config()

    is_smtp_configured = bool(config["host"] and config["user"] and config["password"])

    email_record: Dict[str, Any] = {
        "id": msg_id,
        "to": to_email,
        "from": f"{from_name} <{config['from_email']}>",
        "subject": subject,
        "body": body,
        "html_body": html_body,
        "timestamp": now_iso,
        "mode": "smtp" if is_smtp_configured else "simulated",
    }

    if is_smtp_configured:
        try:
            logger.info("Attempting SMTP dispatch to %s via %s:%s", to_email, config["host"], config["port"])
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{from_name} <{config['from_email']}>"
            msg["To"] = to_email
            msg["Message-ID"] = f"<{msg_id}@spoonsense.dev>"
            msg["Date"] = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")

            part_text = MIMEText(body, "plain", "utf-8")
            msg.attach(part_text)

            if html_body:
                part_html = MIMEText(html_body, "html", "utf-8")
                msg.attach(part_html)

            if config["use_ssl"] or config["port"] == 465:
                server = smtplib.SMTP_SSL(config["host"], config["port"], timeout=10)
            else:
                server = smtplib.SMTP(config["host"], config["port"], timeout=10)
                if config["use_tls"]:
                    server.starttls()

            server.login(config["user"], config["password"])
            server.sendmail(config["from_email"], [to_email], msg.as_string())
            server.quit()

            email_record["status"] = "delivered"
            email_record["message"] = f"Email successfully delivered to {to_email} via SMTP."
            logger.info("SMTP email delivered successfully: %s", msg_id)
        except Exception as exc:
            logger.error("SMTP dispatch failed: %s. Falling back to simulated capture.", exc)
            email_record["status"] = "smtp_fallback_simulated"
            email_record["smtp_error"] = str(exc)
            email_record["message"] = f"SMTP connection error: {exc}. Stored in test dispatch buffer."
    else:
        logger.info("[Simulated Email Dispatch] To: %s | Subject: %s", to_email, subject)
        email_record["status"] = "simulated_sent"
        email_record["message"] = (
            f"Simulated email pushed to {to_email}. "
            "Configure SMTP_HOST, SMTP_USER, SMTP_PASSWORD to send real live emails."
        )

    # Store in memory for inspection and testing
    _SENT_EMAIL_LOG.insert(0, email_record)
    if len(_SENT_EMAIL_LOG) > 100:
        _SENT_EMAIL_LOG.pop()

    return email_record


def send_test_email(
    to_email: str = "test@spoonsense.dev",
    email_type: str = "test_ping",
    student_name: str = "Alex Morgan",
    course_name: str = "CS301 Systems Engineering",
    assignment_title: str = "Project Milestone 1",
    professor_name: str = "Prof. Sharma",
    new_due_date: str = "2026-11-05",
) -> Dict[str, Any]:
    """Helper to dispatch different types of test emails."""
    if email_type == "extension_request":
        from core.planner import generate_extension_email

        email_draft = generate_extension_email(
            student_name=student_name,
            course_name=course_name,
            assignment_title=assignment_title,
            original_due_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            proposed_new_date=new_due_date,
            professor_name=professor_name,
            reason_context="Ensuring rigorous quality across all unit tests and documentation.",
        )
        subject = email_draft["subject"]
        body = email_draft["body"]
        html_body = f"""<div style="font-family: sans-serif; line-height: 1.6; color: #1e293b;">
            <p><strong>Extension Request Draft</strong></p>
            <div style="background: #f8fafc; border-left: 4px solid #6366f1; padding: 16px; border-radius: 4px; white-space: pre-line;">
                {body}
            </div>
            <p style="font-size: 12px; color: #64748b; margin-top: 20px;">Sent via SpoonSense Test Dispatcher (Zero-Shame Academic Assistant)</p>
        </div>"""
    elif email_type == "spoon_checkin":
        subject = "SpoonSense: Gentle Evening Check-in"
        body = (
            f"Hi {student_name},\n\n"
            "Just a quiet check-in as your day winds down.\n"
            "Take a brief moment to reflect on your energy today — no pressure, no guilt.\n\n"
            "Your garden is resting peacefully.\n\n"
            "Warmly,\n"
            "SpoonSense"
        )
        html_body = f"""<div style="font-family: sans-serif; line-height: 1.6; color: #1e293b;">
            <h3 style="color: #4f46e5;">Gentle Evening Check-in</h3>
            <p>Hi {student_name},</p>
            <p>Just a quiet check-in as your day winds down. Take a moment to reflect on your energy today — no pressure, no guilt.</p>
            <p style="color: #059669;">🌱 Your garden is resting peacefully.</p>
            <p>Warmly,<br/>SpoonSense</p>
        </div>"""
    else:  # default "test_ping"
        subject = "SpoonSense: System Test Email Dispatch"
        body = (
            f"Hello {student_name},\n\n"
            "This is a confirmation test email dispatched from your SpoonSense instance.\n\n"
            "System Status: Operational\n"
            "Zero-Shame Engine: Active\n"
            "Database Connectivity: Ready (schema.sql available)\n\n"
            "If you are seeing this, your SpoonSense email dispatch pipeline is functioning properly!\n\n"
            "- SpoonSense Automated Test"
        )
        html_body = f"""<div style="font-family: sans-serif; line-height: 1.6; color: #1e293b;">
            <div style="border-radius: 8px; border: 1px solid #e2e8f0; padding: 20px; background: #ffffff;">
                <h2 style="color: #4f46e5; margin-top: 0;">SpoonSense System Test</h2>
                <p>Hello <strong>{student_name}</strong>,</p>
                <p>This is a confirmation test email dispatched from your SpoonSense instance.</p>
                <ul>
                    <li><strong>Status:</strong> Operational</li>
                    <li><strong>Philosophy:</strong> Zero-Shame cognitive pacing</li>
                    <li><strong>Database:</strong> schema.sql ready for Supabase</li>
                </ul>
                <p style="color: #64748b; font-size: 13px;">Dispatched at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
            </div>
        </div>"""

    return send_email(to_email=to_email, subject=subject, body=body, html_body=html_body)


def get_sent_email_history(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve history of sent emails."""
    return _SENT_EMAIL_LOG[:limit]


def clear_email_history() -> None:
    """Clear memory log for test isolation."""
    _SENT_EMAIL_LOG.clear()
