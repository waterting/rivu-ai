"""Generate the messy acceptance dataset used by Phase 2 work."""

from __future__ import annotations

import csv
import io
import random

BRANDS = ["APPLE", "Apple", "apple", "SAMSUNG", "Samsung", "SONY", "sony"]
CATEGORIES = ["Beverages", "beverages", "Snacks", "SNACKS", "Dairy"]
UNITS = ["ml", "ML", "ltr", "L", "g", "KG", "kg"]
CURRENCIES = ["₹", "$", "INR ", ""]


def messy_rows(count: int = 480, seed: int = 7) -> list[dict[str, str]]:
    rng = random.Random(seed)
    rows: list[dict[str, str]] = []
    for index in range(count):
        sku_number = index % 400 + 1
        sku = f"{sku_number:05d}"
        brand = rng.choice(BRANDS)
        category = rng.choice(CATEGORIES)
        unit = rng.choice(UNITS)
        currency = rng.choice(CURRENCIES)

        price_cents = rng.choice([4999, 12999, 24999, 500, 89, 149900])
        price = f"{currency}{price_cents / 100:,.2f}"

        quantity = rng.choice([1, 2, 5, 10, 25, 100, 9999])
        stock = rng.choice([0, 3, 12, 40, 250])

        if index % 37 == 0:
            order_date = "31/12/2024"
        elif index % 41 == 0:
            order_date = "2024-13-45"
        else:
            order_date = f"2024-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}"

        if index % 53 == 0:
            price = rng.choice(["N/A", "-₹500.00", "0", ""])

        product_name = f"{brand.title()} Product {sku_number % 90}"
        if index % 17 == 0:
            product_name = f"  {product_name.upper()}  "

        rows.append(
            {
                "SKU": sku,
                "Product Name": product_name,
                "Brand": brand,
                "Category": category,
                "Barcode": f"890{rng.randint(1000000000, 9999999999)}",
                "Selling Price": price,
                "Unit Cost": f"₹{price_cents / 200:,.2f}",
                "Qty Sold": str(quantity),
                "Stock": str(stock),
                "Unit": unit,
                "Order Date": order_date,
                "Is Active": rng.choice(["yes", "no", "YES", "NO"]),
                "Image URL": rng.choice(
                    [
                        "https://cdn.example.com/p/1.jpg",
                        "not-a-url",
                        "",
                        "https://cdn.example.com/p/2.jpg",
                    ]
                ),
                "Notes": rng.choice(["", "ok", "handle with care", "fragile"]),
            }
        )
    return rows


def messy_csv_bytes(count: int = 480, seed: int = 7) -> bytes:
    rows = messy_rows(count=count, seed=seed)
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


def sales_rows(count: int = 420, seed: int = 11) -> list[dict[str, str]]:
    rng = random.Random(seed)
    rows: list[dict[str, str]] = []
    products = [f"SKU{i:04d}" for i in range(1, 31)]
    for index in range(count):
        product = products[index % len(products)]
        quantity = rng.randint(1, 20)
        price = rng.choice([9.99, 19.5, 249.0, 1299.0, 45.25])
        cost = round(price * 0.6, 2)
        rows.append(
            {
                "Order ID": f"ORD-{index + 1:05d}",
                "Order Date": f"2024-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}",
                "SKU": product,
                "Product Name": f"Product {product}",
                "Category": rng.choice(["Beverages", "Snacks", "Dairy"]),
                "Brand": rng.choice(["Apple", "Samsung", "Sony"]),
                "Qty Sold": str(quantity),
                "Selling Price": f"{price:.2f}",
                "Unit Cost": f"{cost:.2f}",
                "Stock": str(rng.randint(0, 300)),
                "Currency": "INR",
            }
        )
    return rows


def sales_csv_bytes(count: int = 420, seed: int = 11) -> bytes:
    rows = sales_rows(count=count, seed=seed)
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")