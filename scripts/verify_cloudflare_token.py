#!/usr/bin/env python3
"""Verify a Cloudflare API token without printing or storing it."""

from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import sys
import uuid
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


API_BASE_URL = "https://api.cloudflare.com/client/v4"
ZONE_ID_PATTERN = re.compile(r"^[0-9a-fA-F]{32}$")


@dataclass
class CloudflareAPIError(Exception):
    status: int | None
    errors: list[dict[str, Any]]
    reason: str

    def __str__(self) -> str:
        details = []
        for error in self.errors:
            code = error.get("code", "unknown")
            message = error.get("message", "Unknown Cloudflare error")
            details.append(f"[{code}] {message}")

        prefix = f"HTTP {self.status}" if self.status is not None else self.reason
        return f"{prefix}: {'; '.join(details) if details else self.reason}"


def cloudflare_request(
    token: str,
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        f"{API_BASE_URL}{path}",
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "turntall-cloudflare-token-check/1.0",
        },
    )

    try:
        with urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        try:
            result = json.loads(response_body)
            errors = result.get("errors", [])
        except json.JSONDecodeError:
            errors = []
        raise CloudflareAPIError(error.code, errors, error.reason) from None
    except URLError as error:
        raise CloudflareAPIError(None, [], str(error.reason)) from None

    if not result.get("success", False):
        raise CloudflareAPIError(None, result.get("errors", []), "API request failed")

    return result


def read_token() -> str:
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if token:
        print("Using CLOUDFLARE_API_TOKEN from the environment.")
    else:
        token = getpass.getpass("Cloudflare API token: ")

    token = token.strip()
    if not token:
        raise ValueError("The token is empty.")
    if token[0] in {'\"', "'"} or token[-1] in {'\"', "'"}:
        raise ValueError("Paste the raw token without surrounding quotes.")
    if any(character.isspace() for character in token):
        raise ValueError("The token contains whitespace.")
    return token


def read_zone_id(argument: str | None) -> str:
    zone_id = argument or os.environ.get("CLOUDFLARE_ZONE_ID")
    if not zone_id:
        zone_id = input("Cloudflare Zone ID: ").strip()
    if not ZONE_ID_PATTERN.fullmatch(zone_id):
        raise ValueError("The Zone ID must be exactly 32 hexadecimal characters.")
    return zone_id.lower()


def verify_token(token: str) -> None:
    response = cloudflare_request(token, "GET", "/user/tokens/verify")
    status = response.get("result", {}).get("status")
    if status != "active":
        raise CloudflareAPIError(None, [], f"Token status is {status!r}, not 'active'")
    print("PASS: the API token is valid and active.")


def verify_zone_access(token: str, zone_id: str) -> None:
    query = urlencode({"per_page": 1})
    cloudflare_request(token, "GET", f"/zones/{zone_id}/dns_records?{query}")
    print("PASS: the token can access DNS records for this Zone ID.")


def verify_dns_write(token: str, zone_id: str, domain: str) -> None:
    record_name = f"_terraform-token-test-{uuid.uuid4().hex[:10]}.{domain}"
    record_id: str | None = None

    print(f"Creating temporary TXT record {record_name} ...")
    try:
        response = cloudflare_request(
            token,
            "POST",
            f"/zones/{zone_id}/dns_records",
            {
                "type": "TXT",
                "name": record_name,
                "content": "turntall Terraform token verification",
                "ttl": 60,
                "proxied": False,
                "comment": "Temporary token verification; safe to delete",
            },
        )
        record_id = response.get("result", {}).get("id")
        if not record_id:
            raise CloudflareAPIError(None, [], "Cloudflare did not return a record ID")
        print("PASS: the token has DNS Write permission.")
    finally:
        if record_id:
            try:
                cloudflare_request(
                    token,
                    "DELETE",
                    f"/zones/{zone_id}/dns_records/{record_id}",
                )
                print("PASS: the temporary TXT record was deleted.")
            except CloudflareAPIError as error:
                print(
                    f"WARNING: cleanup failed ({error}). Delete record {record_id} "
                    f"({record_name}) manually.",
                    file=sys.stderr,
                )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify a Cloudflare token and its access to turntall.com."
    )
    parser.add_argument(
        "--zone-id",
        help="Cloudflare Zone ID; defaults to CLOUDFLARE_ZONE_ID or a prompt.",
    )
    parser.add_argument(
        "--domain",
        default="turntall.com",
        help="Domain used for the temporary TXT record (default: turntall.com).",
    )
    parser.add_argument(
        "--test-write",
        action="store_true",
        help="Create and immediately delete a temporary TXT record to test DNS Write.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        token = read_token()
        zone_id = read_zone_id(args.zone_id)
        verify_token(token)
        verify_zone_access(token, zone_id)
        if args.test_write:
            verify_dns_write(token, zone_id, args.domain.rstrip("."))
        else:
            print("Read checks passed. Add --test-write to verify DNS Write permission.")
    except (CloudflareAPIError, ValueError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        return 130

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
