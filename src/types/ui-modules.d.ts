import type { ComponentType } from 'react';

type AnyComponent = ComponentType<any>;

declare module '@/components/ui/button' {
  export const Button: AnyComponent;
  export const buttonVariants: (...args: any[]) => any;
}

declare module '@/components/ui/input' {
  export const Input: AnyComponent;
}

declare module '@/components/ui/badge' {
  export const Badge: AnyComponent;
}

declare module '@/components/ui/skeleton' {
  export const Skeleton: AnyComponent;
}

declare module '@/components/ui/scroll-area' {
  export const ScrollArea: AnyComponent;
  export const ScrollBar: AnyComponent;
}

declare module '@/components/ui/select' {
  export const Select: AnyComponent;
  export const SelectContent: AnyComponent;
  export const SelectGroup: AnyComponent;
  export const SelectItem: AnyComponent;
  export const SelectLabel: AnyComponent;
  export const SelectScrollDownButton: AnyComponent;
  export const SelectScrollUpButton: AnyComponent;
  export const SelectSeparator: AnyComponent;
  export const SelectTrigger: AnyComponent;
  export const SelectValue: AnyComponent;
}

declare module '@/components/ui/dialog' {
  export const Dialog: AnyComponent;
  export const DialogContent: AnyComponent;
  export const DialogDescription: AnyComponent;
  export const DialogFooter: AnyComponent;
  export const DialogHeader: AnyComponent;
  export const DialogTitle: AnyComponent;
  export const DialogTrigger: AnyComponent;
}

declare module '@/components/ui/card' {
  export const Card: AnyComponent;
  export const CardContent: AnyComponent;
  export const CardDescription: AnyComponent;
  export const CardFooter: AnyComponent;
  export const CardHeader: AnyComponent;
  export const CardTitle: AnyComponent;
}

declare module '@/components/ui/label' {
  export const Label: AnyComponent;
}

declare module '@/components/ui/textarea' {
  export const Textarea: AnyComponent;
}

declare module '@/components/ui/dropdown-menu' {
  export const DropdownMenu: AnyComponent;
  export const DropdownMenuContent: AnyComponent;
  export const DropdownMenuItem: AnyComponent;
  export const DropdownMenuLabel: AnyComponent;
  export const DropdownMenuSeparator: AnyComponent;
  export const DropdownMenuTrigger: AnyComponent;
}

declare module '@/components/ui/sheet' {
  export const Sheet: AnyComponent;
  export const SheetContent: AnyComponent;
  export const SheetDescription: AnyComponent;
  export const SheetFooter: AnyComponent;
  export const SheetHeader: AnyComponent;
  export const SheetTitle: AnyComponent;
  export const SheetTrigger: AnyComponent;
}

declare module '@/components/ui/tabs' {
  export const Tabs: AnyComponent;
  export const TabsContent: AnyComponent;
  export const TabsList: AnyComponent;
  export const TabsTrigger: AnyComponent;
}

declare module '@/components/ui/table' {
  export const Table: AnyComponent;
  export const TableBody: AnyComponent;
  export const TableCaption: AnyComponent;
  export const TableCell: AnyComponent;
  export const TableFooter: AnyComponent;
  export const TableHead: AnyComponent;
  export const TableHeader: AnyComponent;
  export const TableRow: AnyComponent;
}

declare module '@/components/ui/separator' {
  export const Separator: AnyComponent;
}

declare module '@/components/ui/tooltip' {
  export const Tooltip: AnyComponent;
  export const TooltipContent: AnyComponent;
  export const TooltipProvider: AnyComponent;
  export const TooltipTrigger: AnyComponent;
}

declare module '@/components/ui/toaster' {
  export const Toaster: AnyComponent;
}
