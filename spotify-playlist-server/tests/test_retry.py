import unittest
from unittest.mock import MagicMock, patch
import requests
from urllib3.util.retry import Retry
from app.services.spotify_service import SpotifyService, SpotifyTokenDB

class TestSpotifyRetry(unittest.TestCase):
    def setUp(self):
        self.mock_db = MagicMock()
        self.service = SpotifyService(self.mock_db)

    @patch('app.services.spotify_service.spotipy.Spotify')
    @patch('app.services.spotify_service.requests.Session')
    def test_retry_configuration(self, mock_session_cls, mock_spotify):
        # Mock token retrieval
        mock_token = MagicMock(spec=SpotifyTokenDB)
        mock_token.access_token = "fake_token"
        mock_token.expires_at = MagicMock()
        # Ensure token is not expired
        mock_token.expires_at.__ge__ = MagicMock(return_value=True) 
        
        # We need to bypass the expiry check. 
        # The code checks: if datetime.now() >= token.expires_at - timedelta(minutes=5)
        # easier to just mock _get_tokens and _refresh_if_needed
        self.service._get_tokens = MagicMock(return_value=mock_token)
        self.service._refresh_if_needed = MagicMock(return_value="fake_token")

        # Call get_spotify_client
        self.service.get_spotify_client()

        # Check if Session was created and mounted with adapters
        mock_session = mock_session_cls.return_value
        self.assertTrue(mock_session.mount.called)
        
        # Verify call args for mount
        # We expect mount('https://', adapter)
        call_args = mock_session.mount.call_args_list
        found_https = False
        for args, _ in call_args:
            if args[0] == "https://":
                adapter = args[1]
                self.assertIsInstance(adapter.max_retries, Retry)
                self.assertEqual(adapter.max_retries.total, 3)
                self.assertEqual(adapter.max_retries.backoff_factor, 1)
                self.assertIn(429, adapter.max_retries.status_forcelist)
                found_https = True
        
        self.assertTrue(found_https, "HTTPS adapter not mounted with correct retry strategy")

if __name__ == '__main__':
    unittest.main()
