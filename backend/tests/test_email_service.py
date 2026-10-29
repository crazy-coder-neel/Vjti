"""Unit and Integration Tests for SpoonSense Email Service and Endpoints."""

import unittest
from fastapi.testclient import TestClient

from core.email_service import (
    clear_email_history,
    get_sent_email_history,
    send_email,
    send_test_email,
)
from main import app


class TestEmailService(unittest.TestCase):
    def setUp(self):
        clear_email_history()

    def tearDown(self):
        clear_email_history()

    def test_send_email_simulated(self):
        res = send_email(
            to_email="student@vjti.ac.in",
            subject="Test Notification",
            body="This is a test notification.",
        )
        self.assertIn(res["status"], ("simulated_sent", "delivered"))
        self.assertEqual(res["to"], "student@vjti.ac.in")
        self.assertEqual(res["subject"], "Test Notification")
        self.assertIn("msg_", res["id"])

        history = get_sent_email_history()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["id"], res["id"])

    def test_send_test_email_extension_request(self):
        res = send_test_email(
            to_email="prof@vjti.ac.in",
            email_type="extension_request",
            student_name="Jane Doe",
            course_name="EE202 Signal Processing",
            assignment_title="Fourier Transform Lab",
            professor_name="Prof. Rao",
            new_due_date="2026-11-10",
        )
        self.assertEqual(res["to"], "prof@vjti.ac.in")
        self.assertIn("Extension Request", res["subject"])
        self.assertIn("Fourier Transform Lab", res["subject"])
        self.assertIn("Jane Doe", res["body"])
        self.assertIn("Prof. Rao", res["body"])

    def test_send_test_email_spoon_checkin(self):
        res = send_test_email(
            to_email="student@vjti.ac.in",
            email_type="spoon_checkin",
            student_name="Jane Doe",
        )
        self.assertEqual(res["to"], "student@vjti.ac.in")
        self.assertIn("Check-in", res["subject"])
        self.assertIn("garden is resting", res["body"])

    def test_api_send_test_email_endpoint(self):
        client = TestClient(app)
        payload = {
            "to_email": "tester@example.com",
            "email_type": "test_ping",
            "student_name": "Test User",
        }
        response = client.post("/api/email/send-test", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        delivery = data["email_delivery"]
        self.assertEqual(delivery["to"], "tester@example.com")
        self.assertIn("System Test", delivery["subject"])

        # Verify history endpoint
        log_resp = client.get("/api/email/sent-log")
        self.assertEqual(log_resp.status_code, 200)
        log_data = log_resp.json()
        self.assertEqual(log_data["status"], "success")
        self.assertGreaterEqual(len(log_data["emails"]), 1)
        self.assertEqual(log_data["emails"][0]["to"], "tester@example.com")


if __name__ == "__main__":
    unittest.main()
