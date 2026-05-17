# Thin shim — all metadata lives in pyproject.toml. Kept so legacy installers
# (pre-PEP 517) can still `python setup.py install`.
from setuptools import setup

setup()
