"use client";

import type { ReactNode } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  InboxIcon,
} from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { isTimeoutError } from "@/lib/ai/errors";
import { cn } from "@/lib/utils";

type Placement = "card" | "page";

export function BaseState({
  title,
  description,
  icon,
  action,
  placement = "page",
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  placement?: Placement;
  className?: string;
}) {
  return (
    <Empty
      className={cn(
        "border-0",
        placement === "page" ? "min-h-[280px]" : "min-h-[160px] p-6",
        className
      )}
    >
      <EmptyHeader>
        {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function ErrorState({
  title = "Algo ha fallado",
  description,
  action,
  placement = "page",
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  placement?: Placement;
  className?: string;
}) {
  return (
    <BaseState
      title={title}
      description={description}
      placement={placement}
      className={className}
      icon={<AlertCircleIcon className="text-destructive" />}
      action={action}
    />
  );
}

export function EmptyState({
  title = "Sin datos",
  description,
  action,
  placement = "page",
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  placement?: Placement;
  className?: string;
}) {
  return (
    <BaseState
      title={title}
      description={description}
      placement={placement}
      className={className}
      icon={<InboxIcon className="text-muted-foreground" />}
      action={action}
    />
  );
}

export function SuccessState({
  title = "Listo",
  description,
  action,
  placement = "page",
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  placement?: Placement;
  className?: string;
}) {
  return (
    <BaseState
      title={title}
      description={description}
      placement={placement}
      className={className}
      icon={<CheckCircle2Icon className="text-positive" />}
      action={action}
    />
  );
}

export function TimeoutState({
  title = "Se ha agotado el tiempo",
  description = "El agente no ha respondido a tiempo.",
  action,
  placement = "page",
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  placement?: Placement;
  className?: string;
}) {
  return (
    <BaseState
      title={title}
      description={description}
      placement={placement}
      className={className}
      icon={<ClockIcon className="text-warning" />}
      action={action}
    />
  );
}

/** Routes timeout failures to TimeoutState; everything else to ErrorState. */
export function AiFailureState({
  error,
  title,
  timeoutTitle,
  action,
  placement = "page",
  className,
}: {
  error: Error | null | undefined;
  title?: string;
  timeoutTitle?: string;
  action?: ReactNode;
  placement?: Placement;
  className?: string;
}) {
  if (!error) return null;
  if (isTimeoutError(error)) {
    return (
      <TimeoutState
        title={timeoutTitle}
        description={error.message || undefined}
        action={action}
        placement={placement}
        className={className}
      />
    );
  }
  return (
    <ErrorState
      title={title}
      description={error.message}
      action={action}
      placement={placement}
      className={className}
    />
  );
}
