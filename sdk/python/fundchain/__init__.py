"""FundChain Python SDK.

Browse, create, and donate to FundChain crowdfunding campaigns from Python.
Handles the x402 payment handshake transparently.
"""

from .agent import FundchainAgent, FundchainError

__all__ = ["FundchainAgent", "FundchainError"]
__version__ = "0.1.0"
