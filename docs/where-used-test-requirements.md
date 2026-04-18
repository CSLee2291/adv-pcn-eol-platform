# Where-Used Card — Test Requirements

> **Purpose:** Mandatory test cases whenever the Where-Used card under PCN Events page is modified.
> **Last updated:** 2026-04-18

---

## Test PCN Cases

| PCN Number | Event ID | MPNs | Item Numbers | Where-Used Records | Notes |
|------------|----------|------|--------------|--------------------|-------|
| `20260402-0172` | `8427e636-e615-4e69-9e37-41e6b5d84978` | 1 (CMI321611J470KT) | 2 | ~20 | Small dataset, basic validation |
| `16143` | `25f4f7cf-c655-40ed-be52-35936d5d6164` | 11 (M24C01/02/04/16 series) | 13 | ~10,606 | **Large dataset**, stress test for performance, cache, and export |

---

## Mandatory Checks

### 1. Data Completeness (PCN 16143)

- [ ] All 11 MPNs resolve to 13 Advantech item numbers via MPN search
- [ ] Where-used query returns ~10,000+ records
- [ ] **Enrichment fields are populated** (not null) for all records:
  - `Model Name` (e.g., "TJ-P011")
  - `Product_Owner` (e.g., "Yusuke.Yorikane-RD.ACG/ATJ(...)")
  - `PG` (e.g., "ACG")
  - `PD` (e.g., "AJP DMS")
  - `EMAIL` (e.g., "yusuke.yorikane@advantech.co.jp")
- [ ] Verify with known record: Product_Name `9615P011020` should have:
  - Model = `TJ-P011`
  - Owner = `Yusuke.Yorikane-RD.ACG/ATJ(?金優佑) (yusuke.yorikane)`

### 2. Cache Behavior

- [ ] **1st query**: Fetches from Denodo, shows `from_denodo > 0` in cache_stats
- [ ] **2nd query (within 24h)**: Returns from cache instantly (< 5 seconds), shows `from_cache > 0, from_denodo = 0`
- [ ] Cache badge displays in UI: "Cached HH:MM" or "All items from 24h cache"
- [ ] **Refresh button**: "Refresh from Denodo" clears cache and re-queries, shows progress bar
- [ ] Cache stats endpoint returns correct counts: `GET /api/v1/whereused/where-used-cache-stats`

### 3. Progress UI (SSE Streaming)

- [ ] Progress bar appears during query with percentage (0% → 100%)
- [ ] Status text shows current step:
  - "Querying item X of Y (ITEM_NUMBER)..." during BOM query
  - "Enriching product info (X/Y)..." during API-2 enrichment
- [ ] No frozen UI — progress updates in real-time
- [ ] On error, progress clears and retry is available

### 4. Excel Export

- [ ] Export button works from **Affected Parts** tab (parts info only, 1 sheet)
- [ ] Export button works from **Where-Used** tab (both sheets)
- [ ] Exported file has **correct column widths** (not hidden, not NaN)
- [ ] Sheet 1 (受影響料號清單): has header + data rows with all 12 columns
- [ ] Sheet 2 (Where used): has header + data rows with all columns including Model Name, Owner, PG, PD
- [ ] Large export (PCN 16143, ~10K rows): file generates without 413 error (bodyLimit = 50MB)
- [ ] Auto-fetch: Export from Where-Used tab auto-fetches parts info if not loaded

### 5. UI Rendering (Both PCN cases)

- [ ] Where-Used tab shows count badge: "Where-Used (20)" or "Where-Used (10606)"
- [ ] Summary cards show: Where-Used Records, Active (M/P) Products, Product Lines
- [ ] Table shows columns: Component, Product, Category, Lifecycle, Model, Plant, Owner
- [ ] Table truncates at 100 rows with "Showing 100 of N records" message
- [ ] No blank/null columns — enrichment fills Model, PG, PD, Owner

### 6. Edge Cases

- [ ] MPN not found in Advantech system → shows "not found" warning
- [ ] Consign part (Y4 prefix, e.g., Y4S55A0304-12) → has 0 where-used but appears in parts info
- [ ] Tab click when AI analysis not done → shows "Run AI analysis first" message
- [ ] Network timeout → error handling, retry available

---

## API Endpoints to Test

```
POST /api/v1/whereused/search-mpn              → MPN search (cached)
POST /api/v1/whereused/parts-info              → Parts info + CE Owner
POST /api/v1/whereused/where-used-query        → Where-used BOM (cached, 24h TTL)
POST /api/v1/whereused/where-used-query/stream → SSE streaming with progress
POST /api/v1/whereused/where-used-query/refresh→ Force refresh (bypass cache)
POST /api/v1/whereused/export-excel            → Excel download (50MB body limit)
GET  /api/v1/whereused/where-used-cache-stats  → Cache statistics
```

---

## Architecture Notes

- **Denodo sync frequency**: Every 12-24 hours depending on data volume
- **Where-used cache TTL**: 24 hours (matches Denodo sync)
- **MPN cache TTL**: 30 days (found) / 7 days (not-found)
- **Enrichment**: Where-used BOM (API-3) returns null for Model/Owner/PG/PD. These are enriched by batch-querying API-2 (AllParts) for each unique Product_Name.
- **Body limit**: Fastify bodyLimit set to 50MB to handle large export payloads
- **Column widths**: ExcelJS `col.values` is sparse (1-indexed). Must iterate with for-loop, not spread into `Math.max` (produces NaN).
