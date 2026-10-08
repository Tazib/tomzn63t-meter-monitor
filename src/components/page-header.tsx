/** Consistent page title row: title, one line of context, optional actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rise flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em]">{title}</h1>
        {description && <p className="max-w-[70ch] text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
