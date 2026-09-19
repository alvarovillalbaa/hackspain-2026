#!/usr/bin/env python3
"""Estimate token count and rough cost for a prompt file.

Uses `tiktoken` when available for accurate counts; otherwise falls back to a
character-based heuristic (~4 chars/token) and labels the result as estimated.
Cost is computed from a small built-in price table (USD per 1M tokens) that can
be overridden on the command line.

Usage:
  estimate_tokens.py prompt.txt
  estimate_tokens.py prompt.txt --model claude-sonnet-4-6 --output-tokens 800
  estimate_tokens.py prompt.txt --in-price 3.0 --out-price 15.0
"""

import argparse
import sys

# Indicative USD price per 1,000,000 tokens (input, output). Override with flags.
PRICE_TABLE = {
    "claude-opus-4-8": (15.0, 75.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
    "gpt-4o": (2.5, 10.0),
    "gpt-4o-mini": (0.15, 0.6),
}

CHARS_PER_TOKEN = 4  # heuristic fallback


def count_tokens(text: str, model: str) -> tuple[int, bool]:
    """Return (token_count, exact). exact=False means heuristic was used."""
    try:
        import tiktoken

        try:
            enc = tiktoken.encoding_for_model(model)
        except KeyError:
            enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text)), True
    except ImportError:
        return max(1, len(text) // CHARS_PER_TOKEN), False


def main() -> int:
    parser = argparse.ArgumentParser(description="Estimate prompt token count and cost.")
    parser.add_argument("file", help="Path to the prompt file.")
    parser.add_argument("--model", default="claude-sonnet-4-6", help="Model id for pricing/encoding.")
    parser.add_argument(
        "--output-tokens",
        type=int,
        default=0,
        help="Expected output tokens to include in the cost estimate.",
    )
    parser.add_argument("--in-price", type=float, help="Override input price (USD per 1M tokens).")
    parser.add_argument("--out-price", type=float, help="Override output price (USD per 1M tokens).")
    args = parser.parse_args()

    try:
        with open(args.file, "r", encoding="utf-8") as handle:
            text = handle.read()
    except FileNotFoundError:
        print(f"Error: file not found: {args.file}", file=sys.stderr)
        return 2

    tokens, exact = count_tokens(text, args.model)

    in_price, out_price = PRICE_TABLE.get(args.model, (None, None))
    if args.in_price is not None:
        in_price = args.in_price
    if args.out_price is not None:
        out_price = args.out_price

    print(f"File:           {args.file}")
    print(f"Model:          {args.model}")
    print(f"Input tokens:   {tokens:,}{'' if exact else '  (estimated, install tiktoken for exact)'}")
    if args.output_tokens:
        print(f"Output tokens:  {args.output_tokens:,} (assumed)")

    if in_price is None:
        print("Cost:           no price known for this model; pass --in-price/--out-price.")
        return 0

    in_cost = tokens / 1_000_000 * in_price
    out_cost = args.output_tokens / 1_000_000 * (out_price or 0.0)
    print(f"Input cost:     ${in_cost:.6f}")
    if args.output_tokens:
        print(f"Output cost:    ${out_cost:.6f}")
    print(f"Total cost:     ${in_cost + out_cost:.6f} per call")
    return 0


if __name__ == "__main__":
    sys.exit(main())
