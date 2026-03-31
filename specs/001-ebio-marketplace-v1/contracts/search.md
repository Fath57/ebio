# API Contract: Search Module

## GET /search/products
Geolocation-based product search — core endpoint.

**Query Parameters**:
```typescript
z.object({
  q: z.string().optional(), // text query
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius: z.number().default(10000), // meters, default 10km
  category: z.string().optional(), // category slug
  maxPrice: z.number().optional(),
  inStockOnly: z.boolean().default(true),
  minRating: z.number().min(1).max(5).optional(),
  mode: z.enum(['CONTACT', 'ORDER']).optional(),
  validatedOnly: z.boolean().default(false),
  sortBy: z.enum(['distance', 'rating', 'price']).default('distance'),
  page: z.number().default(1),
  limit: z.number().default(20).max(50),
})
```

**Response 200**:
```typescript
z.object({
  results: z.array(searchResultSchema),
  total: z.number(),
  page: z.number(),
  hasMore: z.boolean(),
})
```

```typescript
const searchResultSchema = z.object({
  supplier: z.object({
    id: z.string().uuid(),
    shopName: z.string(),
    distance: z.number(), // meters
    rating: z.number().nullable(),
    reviewCount: z.number(),
    mode: z.enum(['CONTACT', 'ORDER']),
    badges: z.array(z.enum(['VALIDATED', 'TOP_SELLER', 'CERTIFIED_BIO'])),
    isOpen: z.boolean(),
  }),
  product: z.object({
    id: z.string().uuid(),
    name: z.string(),
    photo: z.string().url().nullable(),
    pricePerUnit: z.number(),
    unit: z.string(),
    inStock: z.boolean(),
    promotionalPrice: z.number().nullable(),
  }),
})
```

**PostGIS query pattern**: `ST_DWithin(supplier.location, ST_MakePoint(:lng, :lat)::geography, :radius)` with `ST_Distance` for sorting.

---

## GET /search/autocomplete
Autocomplete suggestions for search bar.

**Query Parameters**:
```typescript
z.object({
  q: z.string().min(2),
  latitude: z.number(),
  longitude: z.number(),
})
```

**Response 200**:
```typescript
z.object({
  suggestions: z.array(z.object({
    text: z.string(),
    type: z.enum(['product', 'category', 'supplier']),
    id: z.string().uuid().optional(),
  })),
})
```

---

## GET /search/categories
List product categories with pictogram references.

**Response 200**:
```typescript
z.object({
  categories: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    icon: z.string(),
    productCount: z.number(),
  })),
})
```
