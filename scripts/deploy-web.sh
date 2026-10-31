#!/usr/bin/env bash
set -euo pipefail

DEPLOY_REF=${1:?website commit required}
VALIDATOR_REF=${2:?validator commit required}
LIVE_PATH=${3:-/var/www/otzaria-web}
ROOT_DIR=${DEPLOY_ROOT:-$(dirname "$LIVE_PATH")}
BUILD_DIR=${BUILD_DIR:-$ROOT_DIR/otzaria-build}
RELEASES_DIR=${RELEASES_DIR:-$ROOT_DIR/otzaria-releases}
SHARED_DIR=${SHARED_DIR:-$ROOT_DIR/otzaria-shared}
PM2_APP=${PM2_APP:-otzaria}
BROKER_DIR=${BROKER_DIR:-/opt/otzaria-website}
BROKER_UNIT=${BROKER_UNIT:-otzaria-service-broker}

[[ "$DEPLOY_REF" =~ ^[a-f0-9]{40}$ && "$VALIDATOR_REF" =~ ^[a-f0-9]{40}$ ]] || {
  echo 'Deployment requires immutable commit SHAs' >&2
  exit 1
}

# All destructive targets must be distinct, direct children of one explicit
# deployment root. Resolve `..` without following the live symlink.
ROOT_DIR=$(realpath -m -s -- "$ROOT_DIR")
LIVE_PATH=$(realpath -m -s -- "$LIVE_PATH")
BUILD_DIR=$(realpath -m -s -- "$BUILD_DIR")
RELEASES_DIR=$(realpath -m -s -- "$RELEASES_DIR")
SHARED_DIR=$(realpath -m -s -- "$SHARED_DIR")
[[ "$ROOT_DIR" != / && -d "$ROOT_DIR" && ! -L "$ROOT_DIR" ]] || {
  echo "Unsafe deployment root: $ROOT_DIR" >&2
  exit 1
}
for deploy_path in "$LIVE_PATH" "$BUILD_DIR" "$RELEASES_DIR" "$SHARED_DIR"; do
  [[ "$(dirname "$deploy_path")" == "$ROOT_DIR" ]] || {
    echo "Deployment path must be a direct child of $ROOT_DIR: $deploy_path" >&2
    exit 1
  }
done
[[ "$LIVE_PATH" != "$BUILD_DIR" && "$LIVE_PATH" != "$RELEASES_DIR" &&
   "$LIVE_PATH" != "$SHARED_DIR" && "$BUILD_DIR" != "$RELEASES_DIR" &&
   "$BUILD_DIR" != "$SHARED_DIR" && "$RELEASES_DIR" != "$SHARED_DIR" ]] || {
  echo 'Deployment paths must be distinct' >&2
  exit 1
}
for managed_dir in "$BUILD_DIR" "$RELEASES_DIR" "$SHARED_DIR"; do
  [[ ! -L "$managed_dir" ]] || {
    echo "Managed deployment directory must not be a symlink: $managed_dir" >&2
    exit 1
  }
done

# GitHub concurrency does not cover manual SSH invocations. Hold a host-local
# lock for the complete install/build/activation transaction.
exec 9>"$ROOT_DIR/.otzaria-deploy.lock"
flock -n 9 || {
  echo 'Another Otzaria deployment is already running' >&2
  exit 1
}

RELEASE_ID="$DEPLOY_REF-$VALIDATOR_REF"
NEW_RELEASE="$RELEASES_DIR/$RELEASE_ID"
LEGACY_CANDIDATE="$ROOT_DIR/.otzaria-legacy.$RELEASE_ID"
RECOVERED_LEGACY=
shopt -s nullglob
LEGACY_RECOVERY_PATHS=("$ROOT_DIR"/.otzaria-legacy.*)
shopt -u nullglob
if [[ ! -e "$LIVE_PATH" && ! -L "$LIVE_PATH" ]]; then
  if [[ ${#LEGACY_RECOVERY_PATHS[@]} -eq 1 &&
        "${LEGACY_RECOVERY_PATHS[0]}" == "$LEGACY_CANDIDATE" &&
        -d "$LEGACY_CANDIDATE" && ! -L "$LEGACY_CANDIDATE" ]]; then
    echo 'Recovering an interrupted one-time migration before deployment'
    mv "$LEGACY_CANDIDATE" "$LIVE_PATH"
  else
    echo "Live path is missing and no unambiguous migration recovery exists: $LIVE_PATH" >&2
    exit 1
  fi
elif [[ ${#LEGACY_RECOVERY_PATHS[@]} -gt 0 ]]; then
  if [[ ${#LEGACY_RECOVERY_PATHS[@]} -eq 1 &&
        "${LEGACY_RECOVERY_PATHS[0]}" == "$LEGACY_CANDIDATE" &&
        -L "$LIVE_PATH" && "$(readlink -f "$LIVE_PATH")" == "$NEW_RELEASE" ]]; then
    # A power loss occurred after the atomic link swap but before successful
    # health confirmation. Keep the recovery tree until health passes below.
    RECOVERED_LEGACY=$LEGACY_CANDIDATE
  else
    echo 'Legacy recovery data already exists; refusing automatic deployment' >&2
    exit 1
  fi
fi

pm2 describe "$PM2_APP" >/dev/null

LEGACY_PATH=
PREVIOUS_RELEASE=
ACTIVE_RELEASE=
if [[ -L "$LIVE_PATH" ]]; then
  ACTIVE_RELEASE=$(readlink -f "$LIVE_PATH")
  [[ -d "$ACTIVE_RELEASE" && "$(dirname "$ACTIVE_RELEASE")" == "$RELEASES_DIR" ]] || {
    echo "Live symlink points outside the managed releases directory: $ACTIVE_RELEASE" >&2
    exit 1
  }
fi
ACTIVATED=false
COMPLETE=false
PROCESS_STOPPED=false
CANDIDATE_CREATED=false
# TODO(one-time atomic-release migration): once production has successfully
# migrated and LIVE_PATH is permanently a symlink, remove MIGRATION, the
# LEGACY_PATH branch in restore_previous(), migrate_shared_data(), and the
# migration activation branch below. Keep the normal atomic symlink path.
MIGRATION=false
if [[ -d "$LIVE_PATH" && ! -L "$LIVE_PATH" ]]; then MIGRATION=true; fi
if [[ "$MIGRATION" == true && ( -e "$LEGACY_CANDIDATE" || -L "$LEGACY_CANDIDATE" ) ]]; then
  echo "Legacy recovery path already exists; refusing migration: $LEGACY_CANDIDATE" >&2
  exit 1
fi

check_health() {
  local expected=$1 response api_health
  for attempt in 1 2 3 4 5 6; do
    if response=$(curl --fail --silent --max-time 3 http://127.0.0.1:3000/version.json) &&
       cmp -s "$expected" <(printf '%s' "$response") &&
       api_health=$(curl --fail --silent --max-time 3 http://127.0.0.1:3000/api/dicta/health) &&
       [[ "$api_health" == '{"status":"ok"}' ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if [[ -n "$ACTIVE_RELEASE" && "$ACTIVE_RELEASE" == "$NEW_RELEASE" ]]; then
  if ! check_health "$ACTIVE_RELEASE/public/version.json"; then
    if ! pm2 restart "$PM2_APP" || ! check_health "$ACTIVE_RELEASE/public/version.json"; then
      if [[ -z "$RECOVERED_LEGACY" ]]; then
        echo 'Active release is unhealthy and no migration recovery is available' >&2
        exit 1
      fi
      echo 'Interrupted migration release is unhealthy; restoring legacy checkout' >&2
      rm -f "$LIVE_PATH.rollback"
      ln -s "$RECOVERED_LEGACY" "$LIVE_PATH.rollback"
      mv -Tf "$LIVE_PATH.rollback" "$LIVE_PATH"
      pm2 restart "$PM2_APP"
      check_health "$RECOVERED_LEGACY/public/version.json"
      # PM2 now holds the legacy directory inode. Restore the original
      # directory layout so a subsequent migration starts from known state.
      rm -f "$LIVE_PATH"
      mv "$RECOVERED_LEGACY" "$LIVE_PATH"
      rm -rf "$NEW_RELEASE"
      echo 'Legacy checkout restored; deployment remains failed' >&2
      exit 1
    fi
  fi
  if [[ -n "$RECOVERED_LEGACY" ]]; then rm -rf "$RECOVERED_LEGACY"; fi
  echo "Release already active: $NEW_RELEASE"
  exit 0
fi

restore_previous() {
  if [[ -n "$LEGACY_PATH" ]]; then
    rm -f "$LIVE_PATH"
    mv "$LEGACY_PATH" "$LIVE_PATH"
  elif [[ -n "$PREVIOUS_RELEASE" ]]; then
    rm -f "$LIVE_PATH.rollback"
    ln -s "$PREVIOUS_RELEASE" "$LIVE_PATH.rollback"
    mv -Tf "$LIVE_PATH.rollback" "$LIVE_PATH"
  fi
}

migrate_shared_data() {
  local data_path env_file
  mkdir -p "$SHARED_DIR/public"
  for data_path in storage var public/uploads public/tessdata; do
    mkdir -p "$SHARED_DIR/$(dirname "$data_path")"
    if [[ ! -e "$SHARED_DIR/$data_path" && ! -L "$SHARED_DIR/$data_path" &&
          ( -e "$LIVE_PATH/$data_path" || -L "$LIVE_PATH/$data_path" ) ]]; then
      mv "$LIVE_PATH/$data_path" "$SHARED_DIR/$data_path"
    elif [[ -e "$SHARED_DIR/$data_path" && -e "$LIVE_PATH/$data_path" &&
            ! -L "$LIVE_PATH/$data_path" ]]; then
      echo "Migration conflict: both live and shared $data_path exist" >&2
      return 1
    fi
    mkdir -p "$SHARED_DIR/$data_path" "$LIVE_PATH/$(dirname "$data_path")"
    rm -rf "$LIVE_PATH/$data_path"
    ln -s "$SHARED_DIR/$data_path" "$LIVE_PATH/$data_path"
  done
  for env_file in .env .env.local .env.production .env.production.local; do
    if [[ ! -e "$SHARED_DIR/$env_file" && -f "$LIVE_PATH/$env_file" ]]; then
      mv "$LIVE_PATH/$env_file" "$SHARED_DIR/$env_file"
    elif [[ -f "$SHARED_DIR/$env_file" && -f "$LIVE_PATH/$env_file" &&
            ! -L "$LIVE_PATH/$env_file" ]]; then
      echo "Migration conflict: both live and shared $env_file exist" >&2
      return 1
    fi
    rm -f "$LIVE_PATH/$env_file"
    if [[ -f "$SHARED_DIR/$env_file" ]]; then ln -s "$SHARED_DIR/$env_file" "$LIVE_PATH/$env_file"; fi
  done
}

cleanup() {
  local status=$? rollback_failed=false
  trap - EXIT
  if [[ "$ACTIVATED" == true && "$COMPLETE" != true ]]; then
    echo 'Activation failed; restoring the previous release' >&2
    set +e
    restore_previous || rollback_failed=true
    pm2 restart "$PM2_APP" || rollback_failed=true
    if [[ -n "$PREVIOUS_RELEASE" ]]; then
      check_health "$PREVIOUS_RELEASE/public/version.json" || rollback_failed=true
    elif [[ -s "$LIVE_PATH/public/version.json" ]]; then
      check_health "$LIVE_PATH/public/version.json" || rollback_failed=true
    fi
    if [[ "$rollback_failed" == true ]]; then
      echo "Rollback failed; failed release retained at $NEW_RELEASE" >&2
      exit 1
    fi
  elif [[ "$PROCESS_STOPPED" == true ]]; then
    # A one-time migration can fail while moving shared data, before the live
    # path is replaced. Bring the untouched/linked legacy checkout back up.
    pm2 restart "$PM2_APP" || exit 1
  fi
  if [[ "$COMPLETE" != true && "$CANDIDATE_CREATED" == true &&
        "$NEW_RELEASE" != "$ACTIVE_RELEASE" ]]; then
    rm -rf "$NEW_RELEASE"
  fi
  exit "$status"
}
trap cleanup EXIT

echo 'Preparing the persistent build workspace'
if ! git -C "$BUILD_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  [[ -d "$LIVE_PATH/.git" ]] || {
    echo "Neither $BUILD_DIR nor the legacy live path is a Git checkout" >&2
    exit 1
  }
  ORIGIN_URL=$(git -C "$LIVE_PATH" remote get-url origin)
  git clone "$ORIGIN_URL" "$BUILD_DIR"
fi
git -C "$BUILD_DIR" fetch --depth 1 origin "$DEPLOY_REF"
git -C "$BUILD_DIR" reset --hard "$DEPLOY_REF"
git -C "$BUILD_DIR" clean -fd
rm -rf "$BUILD_DIR/storage" "$BUILD_DIR/var" "$BUILD_DIR/public/uploads" "$BUILD_DIR/public/tessdata"

# Preserve only Next's reusable compiler cache. Every other build output is
# tied to a particular commit and is regenerated.
CACHE_HOLD=$(mktemp -d "$ROOT_DIR/.otzaria-cache.XXXXXX")
if [[ -d "$BUILD_DIR/.next/cache" ]]; then
  mv "$BUILD_DIR/.next/cache" "$CACHE_HOLD/cache"
fi
rm -rf "$BUILD_DIR/.next"
mkdir -p "$BUILD_DIR/.next"
if [[ -d "$CACHE_HOLD/cache" ]]; then mv "$CACHE_HOLD/cache" "$BUILD_DIR/.next/cache"; fi
rmdir "$CACHE_HOLD"
rm -f "$BUILD_DIR/public/version.json" "$BUILD_DIR/public/export-editor/dicta-editor-offline.html"

# The migration build reads the legacy production env; later builds read the
# shared env files. Mutable data is never linked into the build workspace.
for env_file in .env .env.local .env.production .env.production.local; do
  rm -f "$BUILD_DIR/$env_file"
  if [[ -f "$SHARED_DIR/$env_file" ]]; then
    ln -s "$SHARED_DIR/$env_file" "$BUILD_DIR/$env_file"
  elif [[ -f "$LIVE_PATH/$env_file" ]]; then
    ln -s "$LIVE_PATH/$env_file" "$BUILD_DIR/$env_file"
  fi
done

cd "$BUILD_DIR"
npm ci --legacy-peer-deps --prefer-offline --no-audit --no-fund
npm install "github:Otzaria/otzaria-plugin-validator#$VALIDATOR_REF" --legacy-peer-deps --no-save --prefer-offline --no-audit --no-fund
npm run build
test -s .next/prerender-manifest.json
test -s .next/BUILD_ID
test -s public/version.json

mkdir -p "$RELEASES_DIR" "$SHARED_DIR"
if [[ -n "$ACTIVE_RELEASE" ]]; then PREVIOUS_RELEASE=$ACTIVE_RELEASE; fi

# Remove the older previous release before materialising the candidate. There
# are therefore never more than active + candidate/previous release trees.
for release in "$RELEASES_DIR"/*; do
  [[ -e "$release" ]] || continue
  if [[ -n "$PREVIOUS_RELEASE" && "$release" -ef "$PREVIOUS_RELEASE" ]]; then continue; fi
  rm -rf "$release"
done
rm -rf "$NEW_RELEASE"
mkdir -p "$NEW_RELEASE"
CANDIDATE_CREATED=true
# Preserve the established `next start` runtime layout. Releases contain the
# tracked source snapshot, complete production build and installed dependency
# tree, but neither Git metadata nor the reusable compiler cache.
git archive "$DEPLOY_REF" | tar -x -C "$NEW_RELEASE"
cp -a .next "$NEW_RELEASE/.next"
rm -rf "$NEW_RELEASE/.next/cache"
cp -a node_modules "$NEW_RELEASE/node_modules"
cp -a public/. "$NEW_RELEASE/public/"

# Runtime data is shared rather than copied into immutable releases. During
# the one-time migration the targets are populated only after PM2 stops.
mkdir -p "$SHARED_DIR/public"
for data_path in storage var public/uploads public/tessdata; do
  mkdir -p "$SHARED_DIR/$(dirname "$data_path")"
  if [[ "$MIGRATION" != true ]]; then mkdir -p "$SHARED_DIR/$data_path"; fi
  mkdir -p "$NEW_RELEASE/$(dirname "$data_path")"
  rm -rf "$NEW_RELEASE/$data_path"
  ln -s "$SHARED_DIR/$data_path" "$NEW_RELEASE/$data_path"
done

# Verify the packaged tree, not merely the build workspace. This exercises the
# copied traces and all explicitly required dynamic worker/runtime files.
(cd "$NEW_RELEASE" && node scripts/check-production-trace.cjs)
test -x "$NEW_RELEASE/node_modules/.bin/next"
test -s "$NEW_RELEASE/package.json"
test -s "$NEW_RELEASE/.next/BUILD_ID"
for env_file in .env .env.local .env.production .env.production.local; do
  if [[ -f "$SHARED_DIR/$env_file" || ( "$MIGRATION" == true && -f "$LIVE_PATH/$env_file" ) ]]; then
    ln -s "$SHARED_DIR/$env_file" "$NEW_RELEASE/$env_file"
  fi
done

echo 'Activating the immutable release'
if [[ "$MIGRATION" == true ]]; then
  # TODO(one-time atomic-release migration): remove this branch after the
  # first successful production deployment. It keeps the stopped legacy tree
  # only until the new layout passes its health check.
  LEGACY_PATH=$LEGACY_CANDIDATE
  pm2 stop "$PM2_APP"
  PROCESS_STOPPED=true
  migrate_shared_data
  mv "$LIVE_PATH" "$LEGACY_PATH"
  ACTIVATED=true
  ln -s "$NEW_RELEASE" "$LIVE_PATH"
else
  rm -f "$LIVE_PATH.next"
  ln -s "$NEW_RELEASE" "$LIVE_PATH.next"
  mv -Tf "$LIVE_PATH.next" "$LIVE_PATH"
  ACTIVATED=true
fi
pm2 restart "$PM2_APP"
PROCESS_STOPPED=false

if ! check_health "$NEW_RELEASE/public/version.json"; then
  echo 'New release did not pass its health check' >&2
  exit 1
fi

COMPLETE=true
if [[ -n "$LEGACY_PATH" ]]; then rm -rf "$LEGACY_PATH"; fi
echo "Deployment healthy: $NEW_RELEASE"

# The service-plugin broker (workers/service-plugin-broker) runs from its own
# checkout under systemd. Move it to the deployed commit and restart it only if
# it is running. The website is already live, so a failure here only warns.
update_broker() {
  git -C "$BROKER_DIR" fetch --depth 1 origin "$DEPLOY_REF" &&
    git -C "$BROKER_DIR" reset --hard "$DEPLOY_REF" &&
    systemctl try-restart "$BROKER_UNIT"
}
if git -C "$BROKER_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  if update_broker; then
    echo "Service-plugin broker checkout updated: $BROKER_DIR"
  else
    echo "Warning: the service-plugin broker was not updated ($BROKER_DIR)" >&2
  fi
fi
