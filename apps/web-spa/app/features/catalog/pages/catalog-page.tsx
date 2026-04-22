import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@boilerstone/ui/components/primitives/dialog'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@boilerstone/ui/components/primitives/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, PlusCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Can } from '@/lib/casl/can'
import {
  deleteProductMutationOptions,
  fetchProductsQueryOptions,
  updateProductMutationOptions,
} from '../utils/catalog-queries'

export default function CatalogPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editingStock, setEditingStock] = useState<{ id: string, value: number } | null>(null)

  const { data: products, isLoading, isError } = useQuery(fetchProductsQueryOptions())

  const { mutate: updateProduct } = useMutation({
    ...updateProductMutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setEditingStock(null)
    },
  })

  const { mutate: deleteProduct } = useMutation({
    ...deleteProductMutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(t('catalog.deleteSuccess'))
    },
    onError: () => {
      toast.error(t('catalog.deleteError'))
    },
  })

  function handleStockSave(id: string) {
    if (editingStock) {
      updateProduct({ id, stock: editingStock.value })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <Card className="flex flex-col items-center justify-center py-16">
        <p className="text-lg font-semibold text-destructive">{t('common.error')}</p>
        <Button variant="outline" className="mt-4" onClick={() => queryClient.invalidateQueries({ queryKey: ['products'] })}>
          {t('common.retry')}
        </Button>
      </Card>
    )
  }

  const productList = products?.data ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('catalog.title')}</h2>
          <p className="text-muted-foreground">
            {t('catalog.description')}
            {productList.length > 0 && (
              <span className="ml-1 text-sm">
                (
                {products?.meta?.itemCount ?? productList.length}
                {' '}
                {t('catalog.products')}
                )
              </span>
            )}
          </p>
        </div>
        <Can action="create" subject="Product">
          <Button asChild>
            <Link to="/catalogue/nouveau">
              <PlusCircle className="mr-2 h-4 w-4" />
              {t('catalog.addProduct')}
            </Link>
          </Button>
        </Can>
      </div>

      {/* Content */}
      {productList.length === 0
        ? (
            <Card className="flex flex-col items-center justify-center py-16">
              <div className="text-4xl">📦</div>
              <h3 className="mt-4 text-lg font-semibold">{t('catalog.empty.title')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t('catalog.empty.description')}</p>
              <Can action="create" subject="Product">
                <Button className="mt-6" asChild>
                  <Link to="/catalogue/nouveau">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    {t('catalog.addFirstProduct')}
                  </Link>
                </Button>
              </Can>
            </Card>
          )
        : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16" />
                    <TableHead>{t('catalog.columns.name')}</TableHead>
                    <TableHead>{t('catalog.columns.category')}</TableHead>
                    <TableHead className="text-right">{t('catalog.columns.price')}</TableHead>
                    <TableHead className="text-center">{t('catalog.columns.stock')}</TableHead>
                    <TableHead>{t('catalog.columns.status')}</TableHead>
                    <TableHead>{t('catalog.columns.date')}</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productList.map((product) => {
                    const hasPromo = product.promotionalPrice != null && product.promotionalPrice < product.pricePerUnit

                    return (
                      <TableRow
                        key={product.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/catalogue/${product.id}`)}
                      >
                        {/* Photo */}
                        <TableCell>
                          {product.photo
                            ? <img src={product.photo} alt={product.name} className="h-12 w-12 rounded-lg object-cover" />
                            : (
                                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-lg">
                                  🌿
                                </div>
                              )}
                        </TableCell>

                        {/* Name */}
                        <TableCell>
                          <div className="font-medium">{product.name}</div>
                          {hasPromo && (
                            <Badge variant="secondary" className="mt-1 bg-ebio-coral-50 text-ebio-coral-600">
                              {t('catalog.promo')}
                            </Badge>
                          )}
                        </TableCell>

                        {/* Category */}
                        <TableCell>
                          {product.categoryName
                            ? <Badge variant="outline">{product.categoryName}</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>

                        {/* Price */}
                        <TableCell className="text-right font-mono">
                          {hasPromo && (
                            <div className="text-xs text-muted-foreground line-through">
                              {product.pricePerUnit.toLocaleString('fr-FR')}
                            </div>
                          )}
                          <div className={hasPromo ? 'text-ebio-coral-600' : ''}>
                            {(hasPromo ? product.promotionalPrice! : product.pricePerUnit).toLocaleString('fr-FR')}
                            {' '}
                            {t('catalog.currency')}
                          </div>
                        </TableCell>

                        {/* Stock (inline edit) */}
                        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                          <Can action="update" subject="Product">
                            {editingStock?.id === product.id
                              ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <Input
                                      type="number"
                                      value={editingStock.value}
                                      onChange={e => setEditingStock({ id: product.id, value: Number(e.target.value) })}
                                      className="w-16 text-center"
                                      min={0}
                                    />
                                    <Button size="sm" variant="outline" onClick={() => handleStockSave(product.id)}>
                                      <Check className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )
                              : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="px-2 py-1"
                                    onClick={() => setEditingStock({ id: product.id, value: product.stock })}
                                  >
                                    <span className={product.stock === 0 ? 'font-bold text-destructive' : product.stock <= 5 ? 'font-bold text-amber-500' : ''}>
                                      {product.stock}
                                    </span>
                                  </Button>
                                )}
                          </Can>
                        </TableCell>

                        {/* Status — directly from backend enum */}
                        <TableCell>
                          {product.status === 'ACTIVE' && (
                            <Badge className="bg-ebio-green-600">{t('catalog.status.active')}</Badge>
                          )}
                          {product.status === 'OUT_OF_STOCK' && (
                            <Badge variant="destructive">{t('catalog.status.outOfStock')}</Badge>
                          )}
                          {product.status === 'HIDDEN' && (
                            <Badge variant="secondary">{t('catalog.status.hidden')}</Badge>
                          )}
                        </TableCell>

                        {/* Date */}
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(product.createdAt).toLocaleDateString('fr-FR')}
                        </TableCell>

                        {/* Actions */}
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Can action="update" subject="Product">
                              <Button size="sm" variant="ghost" onClick={() => navigate(`/catalogue/${product.id}/modifier`)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </Can>
                            <Can action="delete" subject="Product">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>{t('catalog.deleteConfirm')}</DialogTitle>
                                    <DialogDescription>{t('catalog.deleteWarning')}</DialogDescription>
                                  </DialogHeader>
                                  <DialogFooter>
                                    <DialogClose asChild>
                                      <Button variant="outline">{t('common.cancel')}</Button>
                                    </DialogClose>
                                    <DialogClose asChild>
                                      <Button
                                        variant="destructive"
                                        onClick={() => deleteProduct(product.id)}
                                      >
                                        {t('common.delete')}
                                      </Button>
                                    </DialogClose>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </Can>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
    </div>
  )
}
