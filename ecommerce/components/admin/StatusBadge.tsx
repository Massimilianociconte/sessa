import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
  type ProductStatus
} from "@/lib/domain";

const ORDER_COLORS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-majolica/30 text-yellow-900",
  PAID: "bg-brilliant/15 text-emerald-800",
  PROCESSING: "bg-ceramic/10 text-ceramic",
  READY: "bg-majolica/40 text-yellow-900",
  SHIPPED: "bg-electric/10 text-electric",
  DELIVERED: "bg-brilliant/25 text-emerald-900",
  CANCELLED: "bg-ink/10 text-ink/60",
  REFUNDED: "bg-terracotta/15 text-terracotta"
};

export function OrderStatusBadge({ status }: { status: string }) {
  const s = status as OrderStatus;
  return (
    <span className={`badge ${ORDER_COLORS[s] ?? "bg-ink/10 text-ink/60"}`}>
      {ORDER_STATUS_LABELS[s] ?? status}
    </span>
  );
}

const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  PENDING: "bg-majolica/30 text-yellow-900",
  AUTHORIZED: "bg-ceramic/10 text-ceramic",
  PAID: "bg-brilliant/15 text-emerald-800",
  REFUNDED: "bg-terracotta/15 text-terracotta",
  FAILED: "bg-ink/10 text-ink/60"
};

export function PaymentStatusBadge({ status }: { status: string }) {
  const s = status as PaymentStatus;
  return (
    <span className={`badge ${PAYMENT_COLORS[s] ?? "bg-ink/10 text-ink/60"}`}>
      {PAYMENT_STATUS_LABELS[s] ?? status}
    </span>
  );
}

const PRODUCT_COLORS: Record<ProductStatus, string> = {
  DRAFT: "bg-majolica/30 text-yellow-900",
  ACTIVE: "bg-brilliant/15 text-emerald-800",
  ARCHIVED: "bg-ink/10 text-ink/60"
};

export function ProductStatusBadge({ status }: { status: string }) {
  const s = status as ProductStatus;
  return (
    <span className={`badge ${PRODUCT_COLORS[s] ?? "bg-ink/10 text-ink/60"}`}>
      {PRODUCT_STATUS_LABELS[s] ?? status}
    </span>
  );
}
