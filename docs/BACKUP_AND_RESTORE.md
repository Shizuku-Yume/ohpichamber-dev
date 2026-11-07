# Host and Agent Backup and Restore Guide

This guide describes the operator procedure for backing up and restoring OpenChamber Host state and Oh-My-Pi (OMP) agent state, including SQLite databases, attachments, session transcripts, and credentials.

---

## 1. Data Inventory and File Locations

OpenChamber state is divided between the **Host Gateway data directory** and the **OMP Agent directory**.

### Host Gateway Data Directory
Default location: `~/.config/openchamber` (or the directory specified by `OPENCHAMBER_DATA_DIR`).

- **`host-metadata.sqlite`** (plus `-wal` and `-shm` sidecars):
  - Schema: Managed by `packages/web/server/lib/host/metadata-sqlite.js` with `PRAGMA user_version = 1`.
  - Contents: Project registrations, workspace bindings, session operational metadata, folder hierarchies, attachment metadata, direct command claims, and durable prompt queues (`prompt_queue_*` tables).
- **`host-approval-policies.sqlite`** (plus `-wal` and `-shm` sidecars):
  - Schema: Managed by `packages/web/server/lib/host/approval-policy-store.js` with `PRAGMA user_version = 1`.
  - Contents: Persistent tool approval allow and deny decisions.
- **`attachments/`**:
  - Binary storage for uploaded prompt attachments referenced by `host_attachments` records.
- **`settings.json`**, **`projects/`**:
  - Four-tier user and workspace settings, project configurations, and personal worktree references.
- **`message-queue.json`** (legacy):
  - Retained immutable conversion source (see [Legacy Queue JSON Disposition](#5-legacy-message-queuejson-disposition)).
- **`message-search.sqlite`** (derived):
  - Full-text search index (FTS5). This database is strictly derived from session events and is automatically rebuilt if absent; it does not need to be preserved in backups.

### OMP Agent Directory
OpenChamber assigns each workspace a captured agent directory. The Host default is resolved the same way OMP resolves its own agent directory, in this order:

1. `PI_CODING_AGENT_DIR` when set — used as-is.
2. `PI_CONFIG_DIR` when set — a directory name relative to `$HOME`, or an absolute path used as the config root itself; the agent directory is `<root>/agent`.
3. Otherwise `$HOME/.omp/agent`.

`packages/web/server/lib/host/agent-scope-runtime.js` implements this as `resolveAgentDirectory()`, and `behavior-routes.js` resolves the global `AGENTS.md` against the same directory. The Host passes the captured path to the agent service, which forces every worker's `PI_CODING_AGENT_DIR` to it.

Set `PI_CONFIG_DIR` to run the app against its own OMP state instead of the state the OMP CLI uses. A launcher that relocates everything under one root, such as `~/.local/bin/ohpichamber-iso`, sets `OPENCHAMBER_DATA_DIR`, `OPENCHAMBER_DESKTOP_USER_DATA_DIR`, `OPENCHAMBER_CHATS_DIR`, `PI_CONFIG_DIR`, and `TMPDIR` together so no file is shared with `~/.omp` or `~/.config/openchamber`. A fresh isolated root has no `models.yml`, so copy that file from the shared agent directory to give both sides the same providers.

Inside a worker, `openNativeRuntime` (`packages/agent-service/src/worker/native-runtime.ts`) applies this precedence:
1. **Named profile:** use `OMP_PROFILE` when it is defined, otherwise `PI_PROFILE`. An empty value or `default` selects no profile; an invalid name throws. When a profile resolves, `setProfile(profile)` selects `$HOME/.omp/profiles/<profile>/agent` in OMP's process-wide path resolver, and that resolver ignores the captured agent directory.
2. **Captured agent directory:** with no named profile, `setAgentDir(capturedAgentDirectory)` makes the Host-captured directory authoritative for OMP's resolver and sets `PI_CODING_AGENT_DIR` to it.

In both branches the worker passes the captured agent directory explicitly to settings, credential discovery, and default session-directory resolution. The Host-managed credential database is therefore `<captured agent directory>/agent.db`, and Host-managed session transcripts are under `<captured agent directory>/sessions`. For the default Host setup, the backup target described below is `$HOME/.omp/agent`.
- **`sessions/**/session.jsonl`**:
  - Canonical agent conversation transcripts and turn history in JSON Lines format.
- **`agent.db`**:
  - SQLite database used by OMP AuthStorage (`@oh-my-pi/pi-ai`) holding provider credentials, API keys, and OAuth tokens.

---

## 2. Security and Credential Separation

**CRITICAL:** `agent.db` is a credential-bearing database containing provider secrets, API keys, and OAuth tokens.

- **Never include `agent.db` in shareable or unencrypted backups.**
- If creating an archive for bug reporting, team migration, or non-secure transport, exclude `agent.db`.
- Standard session transcript backups must never contain `agent.db`. Credential backups require an explicitly specified, operator-controlled encrypted destination volume (`ENCRYPTED_CREDENTIALS_DEST`) or direct encryption pipeline (e.g. `gpg`).
- When restoring to a new machine or environment without `agent.db`, the Host and Agent Service start normally, and the operator or user can re-authenticate providers in Settings.
- File permissions for all SQLite files, sidecars, and `agent.db` must remain restricted to the owning user (`mode 0600`, directories `mode 0700`).
- On Windows, Node's filesystem mode arguments do not represent POSIX owner/group/other permissions; privacy there depends on the ACLs of the user-profile directories rather than `0600`/`0700`. The mode requirements and mode tests in this guide apply to POSIX platforms.

---

## 3. Consistent, WAL-Safe Backup Procedure

All Host SQLite databases operate in WAL (`Write-Ahead Logging`) mode (`PRAGMA journal_mode = WAL`). When active, uncommitted or recently committed transactions reside in the `-wal` file. Copying a live SQLite database with shell tools while processes are actively writing is unsafe because sequential file copies cannot guarantee a point-in-time coherent snapshot between the database file, WAL index, and WAL log frames.

A coherent snapshot requires either:
1. **Verifiable Full Quiescence (Offline Snapshot)**: Stopping all processes, verifying complete termination so all write locks and open descriptors are released, and copying the quiescent database and any present sidecars.
2. **SQLite-Level Atomic Snapshot**: Using SQLite's native atomic snapshot capability (`VACUUM INTO 'destination.sqlite'`) through `node:sqlite` or the SQLite API, which checkpoints all WAL state into a single consistent database file without stopping readers.

### Step-by-Step Verifiable Offline Backup

1. **Stop all running processes and verify full quiescence**:
   Signal all OpenChamber and Agent Service processes to stop, then verify that all processes have exited:
   ```bash
   # Terminate running Host and Agent Service processes
   pkill -TERM -f "openchamber" 2>/dev/null || true
   pkill -TERM -f "agent-service" 2>/dev/null || true

   # Wait and verify complete termination
   timeout_counter=0
   while pgrep -f "openchamber" >/dev/null || pgrep -f "agent-service" >/dev/null; do
     if [ "$timeout_counter" -ge 10 ]; then
       echo "Warning: Processes did not terminate cleanly after 10s; sending SIGKILL" >&2
       pkill -KILL -f "openchamber" 2>/dev/null || true
       pkill -KILL -f "agent-service" 2>/dev/null || true
       sleep 1
       break
     fi
     sleep 1
     timeout_counter=$((timeout_counter + 1))
   done

   # Verify no processes remain running
   if pgrep -f "openchamber" >/dev/null || pgrep -f "agent-service" >/dev/null; then
     echo "Error: Failed to stop OpenChamber processes; aborting backup to prevent incoherent state" >&2
     exit 1
   fi
   ```

2. **Verify / Checkpoint WAL sidecars**:
   When cleanly shut down, SQLite automatically checkpoints transactions into the main database. However, offline copying must preserve any remaining sidecar files (`-wal` and `-shm`) if present, copying each file explicitly without wildcard expansion.

3. **Archive Host Gateway data**:
   ```bash
   DATA_DIR="${OPENCHAMBER_DATA_DIR:-$HOME/.config/openchamber}"
   if [ ! -d "$DATA_DIR" ]; then
     echo "Error: Host data directory not found or not a directory: $DATA_DIR" >&2
     exit 1
   fi

   # Define concrete backup root (default to $HOME/openchamber-backups, override with OPENCHAMBER_BACKUP_DIR):
   BACKUP_ROOT="${OPENCHAMBER_BACKUP_DIR:-$HOME/openchamber-backups}"
   mkdir -p "$BACKUP_ROOT" || { echo "Error: Failed to create backup root directory: $BACKUP_ROOT" >&2; exit 1; }
   if [ ! -w "$BACKUP_ROOT" ]; then
     echo "Error: Backup root directory is not writable: $BACKUP_ROOT" >&2
     exit 1
   fi

   TIMESTAMP="$(date +%Y%m%d%H%M%S)"
   BACKUP_DEST="$BACKUP_ROOT/openchamber-host-$TIMESTAMP"
   mkdir -p "$BACKUP_DEST" || { echo "Error: Failed to create Host backup destination directory: $BACKUP_DEST" >&2; exit 1; }
   chmod 700 "$BACKUP_DEST" || { echo "Error: Failed to restrict Host backup destination permissions" >&2; exit 1; }

   # Guard required Host databases and copy main files
   for db_file in "host-metadata.sqlite" "host-approval-policies.sqlite"; do
     src_db="$DATA_DIR/$db_file"
     if [ ! -f "$src_db" ]; then
       echo "Error: Required Host database not found: $src_db" >&2
       exit 1
     fi
     cp -p "$src_db" "$BACKUP_DEST/" || { echo "Error: Failed to copy database: $src_db" >&2; exit 1; }
     chmod 600 "$BACKUP_DEST/$db_file" || { echo "Error: Failed to restrict $db_file permissions" >&2; exit 1; }

     # Copy present sidecar files explicitly (avoiding unmatched wildcards)
     for suffix in "-wal" "-shm"; do
       src_sidecar="$src_db$suffix"
       if [ -f "$src_sidecar" ]; then
         cp -p "$src_sidecar" "$BACKUP_DEST/" || { echo "Error: Failed to copy sidecar: $src_sidecar" >&2; exit 1; }
         chmod 600 "$BACKUP_DEST/$db_file$suffix" || { echo "Error: Failed to restrict $db_file$suffix permissions" >&2; exit 1; }
       fi
     done
   done

   # Copy attachments, projects, settings, and legacy queue
   if [ -d "$DATA_DIR/attachments" ]; then
     cp -rp "$DATA_DIR/attachments" "$BACKUP_DEST/" || { echo "Error: Failed to copy attachments" >&2; exit 1; }
   fi
   if [ -d "$DATA_DIR/projects" ]; then
     cp -rp "$DATA_DIR/projects" "$BACKUP_DEST/" || { echo "Error: Failed to copy projects" >&2; exit 1; }
   fi
   if [ -f "$DATA_DIR/settings.json" ]; then
     cp -p "$DATA_DIR/settings.json" "$BACKUP_DEST/" || { echo "Error: Failed to copy settings.json" >&2; exit 1; }
   fi
   if [ -f "$DATA_DIR/message-queue.json" ]; then
     cp -p "$DATA_DIR/message-queue.json" "$BACKUP_DEST/" || { echo "Error: Failed to copy message-queue.json" >&2; exit 1; }
   fi
   ```

4. **Archive OMP session transcripts (content)**:
   ```bash
   # Host-captured agent directory used for OpenChamber-managed sessions and credentials.
   # The current Host default is fixed; named OMP profiles do not relocate it.
   OMP_DIR="$HOME/.omp/agent"

   if [ ! -d "$OMP_DIR" ]; then
     echo "Error: OMP agent directory not found or not a directory: $OMP_DIR" >&2
     exit 1
   fi

   BACKUP_ROOT="${OPENCHAMBER_BACKUP_DIR:-$HOME/openchamber-backups}"
   OMP_BACKUP_DEST="$BACKUP_ROOT/omp-sessions-${TIMESTAMP:-$(date +%Y%m%d%H%M%S)}"
   mkdir -p "$OMP_BACKUP_DEST" || { echo "Error: Failed to create OMP backup destination directory: $OMP_BACKUP_DEST" >&2; exit 1; }
   if [ ! -w "$OMP_BACKUP_DEST" ]; then
     echo "Error: OMP backup directory is not writable: $OMP_BACKUP_DEST" >&2
     exit 1
   fi
   chmod 700 "$OMP_BACKUP_DEST" || { echo "Error: Failed to restrict OMP backup destination permissions" >&2; exit 1; }

   # Copy session transcripts
   if [ -d "$OMP_DIR/sessions" ]; then
     cp -rp "$OMP_DIR/sessions" "$OMP_BACKUP_DEST/" || { echo "Error: Failed to copy OMP sessions" >&2; exit 1; }
   fi
   ```

5. **Optional: Archive OMP credentials (secure encrypted storage only)**:
   Credentials in `agent.db` must NEVER be copied into standard or shared backups. An operator requiring credential backup MUST explicitly supply an encrypted destination directory:
   ```bash
   # Operator MUST explicitly set ENCRYPTED_CREDENTIALS_DEST (e.g. an encrypted filesystem mount)
   if [ -z "$ENCRYPTED_CREDENTIALS_DEST" ]; then
     echo "Notice: ENCRYPTED_CREDENTIALS_DEST is not set. Skipping credential backup."
     echo "        Provider credentials in agent.db remain on this machine only."
   else
     if [ ! -d "$ENCRYPTED_CREDENTIALS_DEST" ]; then
       echo "Error: ENCRYPTED_CREDENTIALS_DEST is set but not an existing directory: $ENCRYPTED_CREDENTIALS_DEST" >&2
       exit 1
     fi
     if [ ! -w "$ENCRYPTED_CREDENTIALS_DEST" ]; then
       echo "Error: ENCRYPTED_CREDENTIALS_DEST is not writable: $ENCRYPTED_CREDENTIALS_DEST" >&2
       exit 1
     fi

     # Enforce restrictive directory permissions on the encrypted destination
     chmod 700 "$ENCRYPTED_CREDENTIALS_DEST" || { echo "Error: Failed to restrict encrypted destination permissions" >&2; exit 1; }

     if [ -f "$OMP_DIR/agent.db" ]; then
       cp -p "$OMP_DIR/agent.db" "$ENCRYPTED_CREDENTIALS_DEST/" || { echo "Error: Failed to copy agent.db" >&2; exit 1; }
       chmod 600 "$ENCRYPTED_CREDENTIALS_DEST/agent.db" || { echo "Error: Failed to restrict copied agent.db permissions" >&2; exit 1; }

       for suffix in "-wal" "-shm"; do
         if [ -f "$OMP_DIR/agent.db$suffix" ]; then
           cp -p "$OMP_DIR/agent.db$suffix" "$ENCRYPTED_CREDENTIALS_DEST/" || { echo "Error: Failed to copy agent.db$suffix" >&2; exit 1; }
           chmod 600 "$ENCRYPTED_CREDENTIALS_DEST/agent.db$suffix" || { echo "Error: Failed to restrict copied agent.db$suffix permissions" >&2; exit 1; }
         fi
       done
     else
       echo "Notice: agent.db does not exist in $OMP_DIR; no credentials to archive."
     fi
   fi
   ```

---

## 4. Restore Procedure

1. **Ensure all OpenChamber and Agent Service processes are stopped** on the target machine.
2. **Prepare clean restore destination and restore Host data**:
   **IMPORTANT:** Never copy SQLite databases into a destination that contains stale `-wal` or `-shm` sidecar files from a previous run or different database instance. Merging a restored database with mismatched sidecars can corrupt the database upon recovery. If restoring into an existing data directory, remove any existing `*.sqlite*` files before copying:
   ```bash
   if [ -z "$BACKUP_DEST" ] || [ ! -d "$BACKUP_DEST" ]; then
     echo "Error: BACKUP_DEST is not set or not a valid directory (e.g. export BACKUP_DEST=\"$HOME/openchamber-backups/openchamber-host-<timestamp>\")" >&2
     exit 1
   fi

   RESTORE_DIR="${OPENCHAMBER_DATA_DIR:-$HOME/.config/openchamber}"
   mkdir -p "$RESTORE_DIR" || { echo "Error: Failed to create restore directory: $RESTORE_DIR" >&2; exit 1; }
   if [ ! -w "$RESTORE_DIR" ]; then
     echo "Error: Restore directory is not writable: $RESTORE_DIR" >&2
     exit 1
   fi
   chmod 700 "$RESTORE_DIR" || { echo "Error: Failed to restrict restore directory permissions" >&2; exit 1; }

   # Stage both required databases and any present sidecars in private
   # directories under the restore destination. No live file is moved until
   # every required copy and chmod succeeds, and both -wal and -shm must be
   # present together. Rollback uses fixed filename loops, so no state file can
   # fail after a rename and hide which old files must be restored.
   STAGE_DIR=""
   ROLLBACK_DIR=""
   OLD_MOVES_STARTED=0
   INSTALL_STARTED=0
   INSTALL_OK=0
   INSTALL_FILES="host-metadata.sqlite host-metadata.sqlite-wal host-metadata.sqlite-shm host-approval-policies.sqlite host-approval-policies.sqlite-wal host-approval-policies.sqlite-shm"

   rollback_restore() {
     rollback_failed=0
     for rollback_file in $INSTALL_FILES; do
       if [ -f "$ROLLBACK_DIR/$rollback_file" ]; then
         mv -f "$ROLLBACK_DIR/$rollback_file" "$RESTORE_DIR/$rollback_file" || rollback_failed=1
       elif [ "$INSTALL_STARTED" -eq 1 ]; then
         rm -f "$RESTORE_DIR/$rollback_file" || rollback_failed=1
       fi
     done
     return "$rollback_failed"
   }

   cleanup_restore() {
     cleanup_status=$?
     trap - EXIT
     rollback_preserved=0
     if [ "$OLD_MOVES_STARTED" -eq 1 ] && [ "$INSTALL_OK" -ne 1 ]; then
       if ! rollback_restore; then
         rollback_preserved=1
         echo "Error: Restore rollback was incomplete; previous files remain in $ROLLBACK_DIR" >&2
       fi
     fi
     if [ -n "$STAGE_DIR" ]; then
       rm -rf "$STAGE_DIR"
     fi
     if [ "$rollback_preserved" -eq 0 ] && [ -n "$ROLLBACK_DIR" ]; then
       rm -rf "$ROLLBACK_DIR"
     fi
     exit "$cleanup_status"
   }
   trap cleanup_restore EXIT

   STAGE_DIR="$(mktemp -d "$RESTORE_DIR/.host-restore-stage.XXXXXX")" || { echo "Error: Failed to create restore staging directory" >&2; exit 1; }
   chmod 700 "$STAGE_DIR" || { echo "Error: Failed to restrict restore staging directory permissions" >&2; exit 1; }
   ROLLBACK_DIR="$(mktemp -d "$RESTORE_DIR/.host-restore-rollback.XXXXXX")" || { echo "Error: Failed to create restore rollback directory" >&2; exit 1; }
   chmod 700 "$ROLLBACK_DIR" || { echo "Error: Failed to restrict restore rollback directory permissions" >&2; exit 1; }

   # Reject non-regular fixed destination entries. `mv` treats a directory (or
   # a symlink to one) as a destination directory and would report success
   # without replacing the expected database path.
   for install_file in $INSTALL_FILES; do
     install_target="$RESTORE_DIR/$install_file"
     if [ -e "$install_target" ] || [ -L "$install_target" ]; then
       if [ -L "$install_target" ] || [ ! -f "$install_target" ]; then
         echo "Error: Existing restore target is not a regular file: $install_target" >&2
         exit 1
       fi
     fi
   done

   for db_file in "host-metadata.sqlite" "host-approval-policies.sqlite"; do
     backup_db="$BACKUP_DEST/$db_file"
     if [ ! -f "$backup_db" ]; then
       echo "Error: Required database not found in backup: $backup_db" >&2
       exit 1
     fi
     if { [ -f "$backup_db-wal" ] && [ ! -f "$backup_db-shm" ]; } || { [ ! -f "$backup_db-wal" ] && [ -f "$backup_db-shm" ]; }; then
       echo "Error: Incomplete sidecar set for $db_file; both -wal and -shm or neither are required" >&2
       exit 1
     fi
     cp -p "$backup_db" "$STAGE_DIR/" || { echo "Error: Failed to stage $db_file" >&2; exit 1; }
     chmod 600 "$STAGE_DIR/$db_file" || { echo "Error: Failed to restrict staged $db_file permissions" >&2; exit 1; }

     if [ -f "$backup_db-wal" ]; then
       for suffix in "-wal" "-shm"; do
         cp -p "$backup_db$suffix" "$STAGE_DIR/" || { echo "Error: Failed to stage $db_file$suffix" >&2; exit 1; }
         chmod 600 "$STAGE_DIR/$db_file$suffix" || { echo "Error: Failed to restrict staged $db_file$suffix permissions" >&2; exit 1; }
       done
     fi
   done

   # All required files are staged and private. Move the live set aside using
   # the fixed filename list, then install the staged set. Any failure restores
   # the previous live set; if rollback itself fails, its directory is kept.
   OLD_MOVES_STARTED=1
   for install_file in $INSTALL_FILES; do
     if [ -f "$RESTORE_DIR/$install_file" ]; then
       mv -f "$RESTORE_DIR/$install_file" "$ROLLBACK_DIR/$install_file" || { echo "Error: Failed to move existing $install_file aside" >&2; exit 1; }
     fi
   done
   INSTALL_STARTED=1
   for install_file in $INSTALL_FILES; do
     if [ -f "$STAGE_DIR/$install_file" ]; then
       mv -f "$STAGE_DIR/$install_file" "$RESTORE_DIR/$install_file" || { echo "Error: Failed to install staged $install_file" >&2; exit 1; }
     fi
   done
   INSTALL_OK=1
   trap - EXIT
   rm -rf "$STAGE_DIR" "$ROLLBACK_DIR" || { echo "Error: Failed to remove restore staging directories" >&2; exit 1; }

   if [ -d "$BACKUP_DEST/attachments" ]; then
     cp -rp "$BACKUP_DEST/attachments" "$RESTORE_DIR/" || { echo "Error: Failed to restore attachments" >&2; exit 1; }
   fi
   if [ -d "$BACKUP_DEST/projects" ]; then
     cp -rp "$BACKUP_DEST/projects" "$RESTORE_DIR/" || { echo "Error: Failed to restore projects" >&2; exit 1; }
   fi
   if [ -f "$BACKUP_DEST/settings.json" ]; then
     cp -p "$BACKUP_DEST/settings.json" "$RESTORE_DIR/" || { echo "Error: Failed to restore settings.json" >&2; exit 1; }
   fi
   if [ -f "$BACKUP_DEST/message-queue.json" ]; then
     cp -p "$BACKUP_DEST/message-queue.json" "$RESTORE_DIR/" || { echo "Error: Failed to restore message-queue.json" >&2; exit 1; }
   fi

   ```

3. **Restore OMP session transcripts**:
   ```bash
   if [ -z "$OMP_BACKUP_DEST" ] || [ ! -d "$OMP_BACKUP_DEST" ]; then
     echo "Error: OMP_BACKUP_DEST is not set or not a valid directory (e.g. export OMP_BACKUP_DEST=\"$HOME/openchamber-backups/omp-sessions-<timestamp>\")" >&2
     exit 1
   fi

   # Host-captured agent directory used for OpenChamber-managed sessions and credentials.
   # The current Host default is fixed; named OMP profiles do not relocate it.
   OMP_RESTORE_DIR="$HOME/.omp/agent"
   mkdir -p "$OMP_RESTORE_DIR" || { echo "Error: Failed to create OMP restore directory: $OMP_RESTORE_DIR" >&2; exit 1; }
   if [ ! -w "$OMP_RESTORE_DIR" ]; then
     echo "Error: OMP restore directory is not writable: $OMP_RESTORE_DIR" >&2
     exit 1
   fi
   chmod 700 "$OMP_RESTORE_DIR" || { echo "Error: Failed to restrict OMP restore directory permissions" >&2; exit 1; }

   if [ -d "$OMP_BACKUP_DEST/sessions" ]; then
     cp -rp "$OMP_BACKUP_DEST/sessions" "$OMP_RESTORE_DIR/" || { echo "Error: Failed to restore OMP session transcripts" >&2; exit 1; }
   fi

   # If restoring credentials from secure encrypted vault:
   if [ -n "$ENCRYPTED_CREDENTIALS_SRC" ]; then
     if [ ! -d "$ENCRYPTED_CREDENTIALS_SRC" ]; then
       echo "Error: ENCRYPTED_CREDENTIALS_SRC is not a valid directory: $ENCRYPTED_CREDENTIALS_SRC" >&2
       exit 1
     fi
     if [ -f "$ENCRYPTED_CREDENTIALS_SRC/agent.db" ]; then
       # Remove stale destination sidecars while all processes are stopped so the
       # restored agent.db is not paired with another database's WAL/SHM state.
       rm -f "$OMP_RESTORE_DIR/agent.db-wal" "$OMP_RESTORE_DIR/agent.db-shm" || { echo "Error: Failed to clear stale agent.db sidecars" >&2; exit 1; }
       cp -p "$ENCRYPTED_CREDENTIALS_SRC/agent.db" "$OMP_RESTORE_DIR/" || { echo "Error: Failed to restore agent.db" >&2; exit 1; }
       chmod 600 "$OMP_RESTORE_DIR/agent.db" || { echo "Error: Failed to restrict restored agent.db permissions" >&2; exit 1; }

       for suffix in "-wal" "-shm"; do
         if [ -f "$ENCRYPTED_CREDENTIALS_SRC/agent.db$suffix" ]; then
           cp -p "$ENCRYPTED_CREDENTIALS_SRC/agent.db$suffix" "$OMP_RESTORE_DIR/" || { echo "Error: Failed to restore agent.db$suffix" >&2; exit 1; }
           chmod 600 "$OMP_RESTORE_DIR/agent.db$suffix" || { echo "Error: Failed to restrict restored agent.db$suffix permissions" >&2; exit 1; }
         fi
       done
     fi
   fi
   ```

4. **Start OpenChamber**:
   - `openHostMetadataDatabase` checks `PRAGMA user_version`. If the database came from an older version, ordered migrations are executed within an atomic transaction.
   - If the database was created by a newer version than this build supports, startup refuses to open it with an explicit `METADATA_SCHEMA_TOO_NEW` error and makes no schema or data writes.
   - `openApprovalPolicyStore` performs the identical check with `APPROVAL_POLICY_SCHEMA_TOO_NEW`.

---

## 5. Legacy `message-queue.json` Disposition

When upgrading an existing installation, the Host Gateway converts legacy prompts in `message-queue.json` into the `prompt_queue_*` tables in `host-metadata.sqlite`.

- **Why it is kept**: The original `message-queue.json` is retained unmodified as an immutable historical record and fallback safety net.
- **No duplicate replay**: For each converted session, an entry is written into the `prompt_queue_conversion` table in `host-metadata.sqlite`. On subsequent restarts, `convertLegacy` skips sessions that already have conversion receipts.
- **Manual cleanup**: Once the operator confirms that active queues appear correctly in the UI, `message-queue.json` may be manually archived or deleted.
