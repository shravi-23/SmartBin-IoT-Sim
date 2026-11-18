"""
security.py – HMAC-SHA256 tag generation and verification.

The gateway uses this to verify that a packet:
  1. Has a correct 4-byte authentication tag.
  2. Has NOT been replayed (sequence number seen before).
"""

import hmac
import hashlib
import struct

# Shared secret key (in a real system this is provisioned securely)
SECRET_KEY = b"smartbin-secret-key-2024"

# Replay-detection: stores (node_id, seq) tuples already seen by the gateway
_seen_packets: set = set()


def make_tag(node_id: int, seq: int, clock_drift: float, urgency: float) -> bytes:
    """
    Build a 4-byte authentication tag.

    Tag = first 4 bytes of HMAC-SHA256(SECRET_KEY, node_id || seq || clock_drift || urgency)

    Parameters
    ----------
    node_id : int   – which bin sent the packet
    seq     : int   – packet sequence number (16-bit wraps at 65535)
    clock_drift : float – small timing offset in ms (adds freshness)
    urgency : float – urgency index U in [0, 1]

    Returns
    -------
    bytes of length 4
    """
    # Pack the fields into bytes: two 2-byte unsigned ints + two 4-byte floats
    payload = struct.pack(">HHff", node_id, seq, clock_drift, urgency)
    digest = hmac.new(SECRET_KEY, payload, hashlib.sha256).digest()
    return digest[:4]  # truncate to 4 bytes


def verify_tag(node_id: int, seq: int, clock_drift: float, urgency: float,
               received_tag: bytes) -> bool:
    """
    Return True only if the tag matches what we compute locally.
    Does NOT check replay here – call is_replay for that.
    """
    expected = make_tag(node_id, seq, clock_drift, urgency)
    # hmac.compare_digest prevents timing attacks
    return hmac.compare_digest(expected, received_tag)


def is_replay(node_id: int, seq: int) -> bool:
    """
    Return True if we have already seen this (node_id, seq) pair.
    On first sight, register it so future duplicates are caught.
    """
    key = (node_id, seq)
    if key in _seen_packets:
        return True
    _seen_packets.add(key)
    return False


def reset_replay_cache() -> None:
    """Clear the replay-detection set (called on simulation reset)."""
    _seen_packets.clear()
