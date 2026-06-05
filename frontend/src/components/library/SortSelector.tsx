import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface SortOption {
  value: string
  label: string
}

interface SortSelectorProps {
  sortField: string
  sortOrder: 'asc' | 'desc'
  fieldOptions: SortOption[]
  onFieldChange: (field: string) => void
  onOrderChange: (order: 'asc' | 'desc') => void
}

export default function SortSelector({
  sortField,
  sortOrder,
  fieldOptions,
  onFieldChange,
  onOrderChange,
}: SortSelectorProps) {
  const currentLabel = fieldOptions.find(o => o.value === sortField)?.label ?? sortField

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 16 4 4 4-4" /><path d="M7 20V4" /><path d="m21 8-4-4-4 4" /><path d="M17 4v16" />
        </svg>
        <span>{currentLabel}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>排序方式</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sortField} onValueChange={onFieldChange}>
          {fieldOptions.map(opt => (
            <DropdownMenuRadioItem key={opt.value} value={opt.value}>
              {opt.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>排序方向</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sortOrder} onValueChange={v => onOrderChange(v as 'asc' | 'desc')}>
          <DropdownMenuRadioItem value="asc">升序</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="desc">降序</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
