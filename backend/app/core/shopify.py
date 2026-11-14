"""Shopify GraphQL Admin API connector service."""

import re
from typing import Dict, Any, List, Optional
import httpx
import structlog

logger = structlog.get_logger(__name__)


class ShopifyGraphQLClient:
    """Official Shopify Admin GraphQL client (2024-10 / latest stable API version)."""

    def __init__(self, store_url: str, access_token: str):
        # Normalize store domain: e.g., 'mystore.myshopify.com'
        domain = re.sub(r"^https?://", "", store_url).strip().rstrip("/")
        if not domain.endswith(".myshopify.com") and "." not in domain:
            domain = f"{domain}.myshopify.com"
        self.store_domain = domain
        self.access_token = access_token
        self.endpoint = f"https://{self.store_domain}/admin/api/2024-10/graphql.json"

    def is_configured(self) -> bool:
        if not self.access_token:
            return False
        lower = self.access_token.lower()
        return not (
            lower.startswith("placeholder")
            or lower.startswith("shpat_sandbox")
            or lower.startswith("test_")
            or lower.startswith("mock_")
            or "sandbox" in self.store_domain.lower()
            or "test" in self.store_domain.lower()
        )

    async def execute_query(self, query: str, variables: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Execute a GraphQL Admin query with rate-limit and error handling."""
        if not self.is_configured():
            # Return simulated fixture in sandbox/test mode
            logger.info("shopify_sandbox_simulated_query", store=self.store_domain)
            return {
                "data": {
                    "shop": {
                        "name": "Sandbox Test Store",
                        "myshopifyDomain": self.store_domain,
                        "primaryDomain": {"url": f"https://{self.store_domain}"},
                        "plan": {"displayName": "Development"},
                    }
                }
            }

        headers = {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": self.access_token,
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                resp = await client.post(self.endpoint, json={"query": query, "variables": variables or {}}, headers=headers)
                if resp.status_code == 401:
                    raise RuntimeError("Invalid Shopify access token or permissions revoked.")
                if resp.status_code == 429:
                    raise RuntimeError("Shopify API rate limit exceeded. Backoff required.")
                data = resp.json()
                if "errors" in data:
                    raise RuntimeError(f"Shopify GraphQL error: {data['errors']}")
                return data
            except httpx.RequestError as exc:
                logger.error("shopify_request_failed", error=str(exc))
                raise RuntimeError(f"Failed to communicate with Shopify store {self.store_domain}: {exc}")

    async def verify_connection(self) -> Dict[str, Any]:
        query = """
        query GetShopDetails {
            shop {
                name
                myshopifyDomain
                plan {
                    displayName
                }
            }
        }
        """
        return await self.execute_query(query)

    async def create_draft_product(self, product_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a draft product in Shopify using official productCreate mutation.
        
        Always defaults to DRAFT status unless explicitly approved by user.
        """
        mutation = """
        mutation CreateProduct($input: ProductInput!) {
            productCreate(input: $input) {
                product {
                    id
                    title
                    handle
                    status
                    totalVariants
                }
                userErrors {
                    field
                    message
                }
            }
        }
        """
        status_value = "ACTIVE" if product_data.get("publish_live") else "DRAFT"

        # Build product input schema
        input_payload = {
            "title": product_data.get("title") or "Untitled Product",
            "descriptionHtml": product_data.get("description") or product_data.get("short_description") or "",
            "vendor": product_data.get("brand") or "Rivu Supplier",
            "productType": product_data.get("category") or "",
            "status": status_value,
            "tags": product_data.get("tags") or [],
        }

        if not self.is_configured():
            # Return sandbox product response
            return {
                "product": {
                    "id": f"gid://shopify/Product/sandbox_{abs(hash(input_payload['title']))}",
                    "title": input_payload["title"],
                    "handle": "sandbox-product",
                    "status": status_value,
                    "totalVariants": 1,
                },
                "userErrors": [],
            }

        result = await self.execute_query(mutation, {"input": input_payload})
        create_res = result.get("data", {}).get("productCreate", {})
        if create_res.get("userErrors"):
            error_msgs = "; ".join([e.get("message", "") for e in create_res["userErrors"]])
            raise RuntimeError(f"Shopify product validation error: {error_msgs}")
        return create_res
