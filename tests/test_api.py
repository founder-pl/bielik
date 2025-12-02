#!/usr/bin/env python3
"""
Detax.pl - Testy API
"""

import pytest
import requests
from typing import Dict, Any

# Configuration
BASE_URL = "http://localhost:8005"
TIMEOUT = 60  # AI może potrzebować więcej czasu
DEMO_EMAIL = "demo@detax.pl"
DEMO_PASSWORD = "demo123"


class TestDetaxAPI:
    """Testy API Detax.pl"""
    
    def test_health_check(self):
        """Test health endpoint"""
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
    
    def test_health_services(self):
        """Test statusu usług wewnętrznych"""
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        if "services" in data:
            services = data["services"]
            assert services.get("api") == "healthy"


class TestDetaxAI:
    """Testy AI Detax.pl"""
    
    def test_chat_simple_question(self):
        """Test prostego pytania do AI"""
        response = requests.post(
            f"{BASE_URL}/api/v1/chat",
            json={
                "message": "Co to jest KSeF?",
                "module": "ksef"
            },
            timeout=TIMEOUT
        )
        assert response.status_code == 200
        data = response.json()
        assert "response" in data or "answer" in data
    
    def test_chat_ksef_module(self):
        """Test modułu KSeF"""
        response = requests.post(
            f"{BASE_URL}/api/v1/chat",
            json={
                "message": "Kiedy KSeF będzie obowiązkowy?",
                "module": "ksef"
            },
            timeout=TIMEOUT
        )
        assert response.status_code == 200
    
    def test_chat_zus_module(self):
        """Test modułu ZUS"""
        response = requests.post(
            f"{BASE_URL}/api/v1/chat",
            json={
                "message": "Ile wynoszą składki ZUS?",
                "module": "zus"
            },
            timeout=TIMEOUT
        )
        assert response.status_code == 200
    
    def test_chat_b2b_module(self):
        """Test modułu B2B"""
        response = requests.post(
            f"{BASE_URL}/api/v1/chat",
            json={
                "message": "Jakie są ryzyka umowy B2B?",
                "module": "b2b"
            },
            timeout=TIMEOUT
        )
        assert response.status_code == 200
    
    def test_chat_vat_module(self):
        """Test modułu VAT"""
        response = requests.post(
            f"{BASE_URL}/api/v1/chat",
            json={
                "message": "Co to jest JPK_VAT?",
                "module": "vat"
            },
            timeout=TIMEOUT
        )
        assert response.status_code == 200
    
    def test_chat_empty_message(self):
        """Test pustej wiadomości"""
        response = requests.post(
            f"{BASE_URL}/api/v1/chat",
            json={
                "message": "",
                "module": "default"
            },
            timeout=TIMEOUT
        )
        # Powinien zwrócić błąd lub domyślną odpowiedź
        assert response.status_code in [200, 400, 422]


class TestDetaxModules:
    """Testy modułów Detax.pl"""
    
    def test_available_modules(self):
        """Test listy dostępnych modułów"""
        response = requests.get(
            f"{BASE_URL}/api/v1/modules",
            timeout=10
        )
        # Endpoint może nie istnieć
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, (list, dict))


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
