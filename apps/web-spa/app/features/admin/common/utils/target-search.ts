import type { PickerOption } from '../components/entity-picker'
import { client } from '@boilerstone/openapi-generator'

/** Kept small: a picker is for recognising, not for browsing a catalogue. */
const LIMIT = 20

interface SupplierRow {
  id: string
  shopName: string
  neighborhood?: string | null
  profilePhoto?: string | null
}

interface ProductRow {
  id: string
  name: string
  photo?: string | null
  supplierName?: string | null
}

export async function searchSuppliers(query: string): Promise<PickerOption[]> {
  const result = await client.get({
    url: '/api/admin/suppliers',
    query: { q: query, page: '1', limit: String(LIMIT) },
  })
  const items = (result.data as { items?: SupplierRow[] })?.items ?? []
  return items.map(item => ({
    id: item.id,
    label: item.shopName,
    context: item.neighborhood ?? null,
    imageUrl: item.profilePhoto ?? null,
  }))
}

export async function searchProducts(query: string): Promise<PickerOption[]> {
  const result = await client.get({
    url: '/api/admin/products',
    query: { q: query, limit: String(LIMIT) },
  })
  const items = (result.data as { items?: ProductRow[] })?.items ?? []
  return items.map(item => ({
    id: item.id,
    label: item.name,
    context: item.supplierName ?? null,
    imageUrl: item.photo ?? null,
  }))
}
