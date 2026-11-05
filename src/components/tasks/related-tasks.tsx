import { ListChecks } from "lucide-react";
import { Suspense } from "react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions";
import { tasksForEntity } from "@/services/task.service";
import { NewTaskButton } from "./new-task-button";
import { TaskList } from "./task-list";

type RelatedTasksProps = { lead?: string; customer?: string; project?: string };

/**
 * "Tasks" card for a lead, customer or project detail page: open tasks
 * (soonest first), then recently completed ones, each completable inline,
 * plus an "Add task" button pre-filled with the relation.
 */
export function RelatedTasks(props: RelatedTasksProps) {
  return (
    <Suspense fallback={<RelatedTasksSkeleton />}>
      <RelatedTasksCard {...props} />
    </Suspense>
  );
}

async function RelatedTasksCard({ lead, customer, project }: RelatedTasksProps) {
  const user = await requireUser();
  if (!hasPermission(user, "tasks:read")) return null;
  const { open, completed, prefill } = await tasksForEntity(user, { lead, customer, project });
  const now = new Date().toISOString();
  const canWrite = hasPermission(user, "tasks:write");
  const hideRelation = project ? "project" : lead ? "lead" : "customer";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Tasks
          {open.length > 0 && (
            <span className="bg-muted text-muted-foreground rounded-full px-2 text-xs font-medium tabular-nums">{open.length} open</span>
          )}
        </CardTitle>
        {canWrite && (
          <CardAction>
            <NewTaskButton currentUserId={user.id} relationOptions={prefill} label="Add task" variant="outline" size="sm" />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {open.length === 0 && completed.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <ListChecks className="size-4" aria-hidden="true" /> No tasks or follow-ups yet.
          </p>
        ) : (
          <>
            {open.length > 0 ? (
              <TaskList tasks={open} now={now} currentUserId={user.id} canWrite={canWrite} hideRelation={hideRelation} className="-my-3" />
            ) : (
              <p className="text-muted-foreground text-sm">All caught up — no open tasks.</p>
            )}
            {completed.length > 0 && (
              <section aria-label="Recently completed" className="flex flex-col gap-1 border-t pt-3">
                <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Recently completed</h3>
                <TaskList tasks={completed} now={now} currentUserId={user.id} canWrite={canWrite} hideRelation={hideRelation} />
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RelatedTasksSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading tasks">
      <CardHeader>
        <Skeleton className="h-5 w-24" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
