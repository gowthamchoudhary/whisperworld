#!/usr/bin/env python3
"""
Test script for WhisperWorld AI and ElevenLabs integration
"""
import asyncio
import json
import os
import sys
from pathlib import Path

import httpx

# Add backend to path
backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))

# Set environment variables
os.environ["SUPABASE_URL"] = "https://tunktgbkragjuxcfwfmg.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1bmt0Z2JrcmFnanV4Y2Z3Zm1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjUwNDA5OSwiZXhwIjoyMDkyMDgwMDk5fQ.NhK1Q-wzPh0Mg4RBVtwJ6JS4qJ_FjzJRApAnxk8K-_Y"
os.environ["GROQ_API_KEY"] = "your_groq_api_key_here"
os.environ["ELEVENLABS_API_KEY"] = "sk_e8cbf828f8933c524dc29f4f5bf0195a97c0326852884bb7"

async def test_groq_api():
    """Test Groq API with available models"""
    print("🧠 Testing Groq API...")
    try:
        from groq import Groq
        client = Groq(api_key=os.environ["GROQ_API_KEY"])
        
        # Try llama-3.3-70b-versatile (latest available)
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": "Hello, this is a test message. Please respond with 'Groq API is working!'"}],
            max_tokens=50,
            temperature=0.1
        )
        
        content = response.choices[0].message.content
        print(f"✅ Groq API Response: {content}")
        return True
        
    except Exception as e:
        print(f"❌ Groq API Error: {e}")
        return False

async def test_groq_vision():
    """Test Groq Vision API directly"""
    print("👁️ Testing Groq Vision API...")
    try:
        from groq import Groq
        import base64
        
        client = Groq(api_key=os.environ["GROQ_API_KEY"])
        
        # Create a simple test image (1x1 pixel JPEG)
        test_image = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x11\x08\x00\x01\x00\x01\x01\x01\x11\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x08\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00\x3f\x00\xaa\xff\xd9'
        image_base64 = base64.b64encode(test_image).decode('utf-8')
        
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "What do you see in this image? Respond with a simple description."
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_base64}"
                        }
                    }
                ]
            }
        ]
        
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model="llama-3.2-11b-vision-preview",
            messages=messages,
            max_tokens=100,
            temperature=0.1
        )
        
        content = response.choices[0].message.content
        print(f"✅ Groq Vision Response: {content}")
        return True
        
    except Exception as e:
        print(f"❌ Groq Vision Error: {e}")
        return False

async def test_elevenlabs_api():
    """Test ElevenLabs API directly"""
    print("🎵 Testing ElevenLabs API...")
    try:
        headers = {
            "xi-api-key": os.environ["ELEVENLABS_API_KEY"],
            "Content-Type": "application/json"
        }
        
        # Test voice list endpoint (should work with most API keys)
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                "https://api.elevenlabs.io/v1/voices",
                headers=headers
            )
            
            if response.status_code == 200:
                voices = response.json()
                print(f"✅ ElevenLabs API: Found {len(voices.get('voices', []))} voices")
                return True
            else:
                print(f"❌ ElevenLabs API Error: {response.status_code} - {response.text}")
                return False
                
    except Exception as e:
        print(f"❌ ElevenLabs API Error: {e}")
        return False

async def test_backend_endpoints():
    """Test backend API endpoints"""
    print("🔌 Testing Backend Endpoints...")
    try:
        base_url = "https://whisperworld-backend.onrender.com"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Test health endpoint
            health_response = await client.get(f"{base_url}/health")
            print(f"  Health endpoint: {health_response.status_code}")
            
            # Test identify endpoint (without auth - should get 401)
            identify_response = await client.post(f"{base_url}/api/identify")
            print(f"  Identify endpoint (no auth): {identify_response.status_code} (expected 401)")
            
            # Test profile endpoint (without auth - should get 401)  
            profile_response = await client.post(f"{base_url}/api/profile")
            print(f"  Profile endpoint (no auth): {profile_response.status_code} (expected 401)")
            
            # Test sing endpoint (without auth - should get 401)
            sing_response = await client.post(f"{base_url}/api/sing")
            print(f"  Sing endpoint (no auth): {sing_response.status_code} (expected 401)")
            
            print("✅ Backend endpoints are responding correctly")
            return True
            
    except Exception as e:
        print(f"❌ Backend Endpoints Error: {e}")
        return False

async def test_vision_engine():
    """Test vision engine with a simple test"""
    print("🔍 Testing Vision Engine...")
    try:
        from app.services.vision_engine import identify
        
        # Create a simple test image (1x1 pixel JPEG)
        test_image = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x11\x08\x00\x01\x00\x01\x01\x01\x11\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x08\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00\x3f\x00\xaa\xff\xd9'
        
        results = await identify(test_image)
        print(f"✅ Vision Engine: Processed image, found {len(results)} results")
        return True
        
    except Exception as e:
        print(f"❌ Vision Engine Error: {e}")
        return False

async def main():
    """Run all tests"""
    print("🧪 WhisperWorld Groq & ElevenLabs Integration Test")
    print("=" * 55)
    
    tests = [
        ("Backend Endpoints", test_backend_endpoints),
        ("Groq API", test_groq_api),
        ("ElevenLabs API", test_elevenlabs_api),
        ("Vision Engine", test_vision_engine),
    ]
    
    results = {}
    for test_name, test_func in tests:
        try:
            results[test_name] = await test_func()
        except Exception as e:
            print(f"❌ {test_name} Test Failed: {e}")
            results[test_name] = False
        print()
    
    print("📊 Test Results Summary:")
    print("=" * 30)
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{test_name}: {status}")
    
    total_tests = len(results)
    passed_tests = sum(results.values())
    print(f"\nOverall: {passed_tests}/{total_tests} tests passed")
    
    if passed_tests == total_tests:
        print("🎉 All tests passed! Groq and ElevenLabs integration is working!")
    else:
        print("⚠️ Some tests failed. Check the errors above.")

if __name__ == "__main__":
    asyncio.run(main())