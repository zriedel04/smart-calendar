import { useSync } from '../sync/context';
import { Button, Modal } from './ui';

/** Asked once, the first time a device that has its own calendar signs in to an account that has a different one. */
export function SyncConflictDialog() {
  const sync = useSync();
  const remote = sync.conflict;
  if (!remote || sync.conflictPostponed) return null;
  const count = remote.data.tasks.filter((t) => !t.completedAt).length;

  return (
    <Modal
      title="Which calendar do you want to keep?"
      // Closing it isn't a choice: nothing is replaced, and nothing syncs until you pick one.
      onClose={sync.postponeConflict}
      footer={
        <>
          <Button onClick={() => sync.resolveConflict('device')}>Keep this device's</Button>
          <Button variant="primary" onClick={() => sync.resolveConflict('account')}>
            Use my account's
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Your account already has a calendar ({count} open {count === 1 ? 'task' : 'tasks'}), and this device has a different one.
        After you choose, both stay in sync and changes on either device carry over.
      </p>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
        Keeping this device's replaces the account's calendar. To combine them, export a backup first.
      </p>
    </Modal>
  );
}
