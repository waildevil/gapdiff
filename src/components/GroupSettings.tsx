'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteGroupAction, renameGroupAction } from '@/app/actions/groups';
import styles from './GroupSettings.module.css';

interface Props {
  groupId: number;
  slug: string;
  name: string;
}

export function GroupSettings({ groupId, slug, name }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isRenaming, startRename] = useTransition();

  const [confirmText, setConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  function handleRename(event: React.FormEvent) {
    event.preventDefault();
    setRenameError(null);
    setSaved(false);
    startRename(async () => {
      const result = await renameGroupAction(groupId, slug, value);
      if (!result.ok) {
        setRenameError(result.error);
        return;
      }
      setValue(result.name);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    });
  }

  function handleDelete() {
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteGroupAction(groupId);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      router.push('/groups');
    });
  }

  const canDelete = confirmText.trim() === name;

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Group settings</div>
        </div>

        <form className={styles.renameForm} onSubmit={handleRename}>
          <input
            className={styles.input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={64}
          />
          <button
            className={styles.save}
            type="submit"
            disabled={isRenaming || value.trim() === name || !value.trim()}
          >
            {isRenaming ? 'Saving…' : saved ? 'Saved' : 'Rename'}
          </button>
        </form>

        {renameError ? <p className={styles.error}>{renameError}</p> : null}
      </div>

      <div className={`card ${styles.danger}`}>
        <div className="card-head">
          <div className={styles.dangerTitle}>Danger zone</div>
        </div>

        <div className={styles.dangerBody}>
          <p className={styles.dangerText}>
            Deleting <b>{name}</b> removes it for every member — standings, invites and the
            board. Riot accounts and match history aren&apos;t touched, since those aren&apos;t
            this group&apos;s to begin with.
          </p>

          <label className={styles.confirmLabel}>
            Type <code>{name}</code> to confirm
          </label>
          <input
            className={styles.input}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />

          <button
            className={styles.deleteButton}
            onClick={handleDelete}
            disabled={!canDelete || isDeleting}
          >
            {isDeleting ? 'Deleting…' : 'Delete this group'}
          </button>

          {deleteError ? <p className={styles.error}>{deleteError}</p> : null}
        </div>
      </div>
    </>
  );
}
