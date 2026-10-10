#!/usr/bin/env bash
# Chạy toàn bộ kiểm của phần main process (không cần Electron — `electron` được giả lập).
#   bash apps/desktop/test/run.sh
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"
rm -rf .test-build
# Biên dịch CẢ HAI file trong một lượt: outDir giữ cấu trúc thư mục chung nhỏ nhất, nên khi
# compile chung thì đường dẫn là .test-build/runtime/<tên>.js — các test dựa vào đúng đường đó.
# @larkwave/core phải được dựng TRƯỚC: các file dưới đây import kiểu từ dist của nó, và một
# dist cũ sẽ báo lỗi kiểu ma (đúng lớp lỗi "stale core" từng làm trắng màn hình bản cài).
(cd ../.. && pnpm --filter @larkwave/core build >/dev/null)
npx tsc main/runtime/versionHint.ts main/runtime/apiRunner.ts main/runtime/lark/larkToolExec.ts \
  main/runtime/lark/ooxml.ts main/runtime/lark/automationEngine.ts main/runtime/lark/skillRun.ts \
  main/runtime/lark/fileBuild.ts main/runtime/lark/filePaths.ts main/runtime/lark/fileContext.ts \
  main/runtime/lark/automationFiles.ts main/runtime/lark/unattendedPolicy.ts main/runtime/lark/upsertPlan.ts main/runtime/lark/autoRunRecorder.ts \
  main/runtime/lark/larkUiCore.ts main/runtime/lark/larkCdp.ts main/runtime/lark/larkTemplates.ts main/runtime/lark/larkLoginState.ts \
  main/runtime/lark/workflowV3.ts main/runtime/lark/tools/workflowsV3.ts \
  main/runtime/migrate/toolswaveMigrator.ts main/runtime/skills/skillHost.ts main/runtime/skills/builtinSkills.ts main/deviceIdentity.ts \
  main/runtime/claudeSessions.ts main/runtime/lark/transcript.ts main/runtime/contextBudget.ts \
  main/runtime/lark/bitableEncode.ts main/runtime/lark/webRecords.ts main/runtime/lark/webFiles.ts main/runtime/lark/filePreview.ts \
  main/runtime/lark/larkWebApi.ts main/runtime/lark/workflowInternal.ts main/runtime/lark/webAutomation.ts main/runtime/lark/workflowBlock.ts main/runtime/lark/baseStructure.ts main/runtime/lark/mcpServer.ts \
  --outDir .test-build --module commonjs --target es2020 --esModuleInterop --skipLibCheck
# Bộ gánh nhiều tenant của tw-lark-runner. Nằm ngoài apps/desktop nên outDir sinh ra đường dẫn
# .test-build/tw-lark-runner/src/hosted.js — test dựa vào đúng đường đó. Nuốt lỗi KIỂU vì cây
# import của nó chạm @larkwave/shared mà lượt tsc trần này không có ánh xạ đường dẫn; kiểu thật
# đã được kiểm ở typecheck:desktop.
npx tsc ../../tw-lark-runner/src/hosted.ts \
  --outDir .test-build --module commonjs --target es2020 --esModuleInterop --skipLibCheck >/dev/null 2>&1 || true
test -f .test-build/tw-lark-runner/src/hosted.js || { echo "✗ không biên dịch được hosted.ts"; exit 1; }
# larkService kéo theo một cây import lớn có tham chiếu KIỂU tới @larkwave/shared, mà lượt gọi
# tsc trần này không có ánh xạ đường dẫn để phân giải. Chỉ là lỗi KIỂU — JS vẫn xuất ra đủ, và
# kiểu của file này đã được kiểm đầy đủ ở `tsc --noEmit -p apps/desktop/tsconfig.json` trong CI.
# Nuốt mã lỗi ở đây, nhưng kiểm lại rằng tệp cần dùng đã thực sự được sinh ra.
# Bộ rút nút hành động nằm ở packages/ui nhưng là hàm THUẦN (không import React) nên biên dịch
# riêng được vào .test-build/ui — chỗ duy nhất trong bộ kiểm này chạm tới mã giao diện.
npx tsc ../../packages/ui/src/components/lark/answerActions.ts ../../packages/ui/src/components/lark/larkDock.ts ../../packages/ui/src/components/lark/quickAsks.ts \
  ../../packages/ui/src/components/lark/engineChip.ts ../../packages/ui/src/components/lark/larkLayout.ts ../../packages/ui/src/components/lark/larkConversations.ts \
  --outDir .test-build/ui --module commonjs --target es2020 --skipLibCheck
# Lớp tương thích API Toolswave (thuần, không import) — biên dịch riêng để không đổi gốc thư mục ở trên.
npx tsc ../../packages/ui/src/account/compat.ts --outDir .test-build/ui-account --module commonjs --target es2020 --skipLibCheck
# Hợp đồng skill là module THUẦN ở packages/core — biên dịch riêng để bài kiểm gọi đúng luật đó
# chứ không phải một bản chép (cùng lý do với canTakeRunner).
npx tsc ../../packages/core/src/skillContract.ts ../../packages/core/src/skillLearning.ts \
  --outDir .test-build/core --module commonjs --target es2020 --skipLibCheck
npx tsc main/runtime/agentLock.ts main/runtime/lark/larkService.ts \
  --outDir .test-build --module commonjs --target es2020 --esModuleInterop --skipLibCheck >/dev/null 2>&1 || true
test -f .test-build/runtime/lark/larkService.js || { echo "✗ không biên dịch được larkService"; exit 1; }
test -f .test-build/runtime/lark/tools/index.js || { echo "✗ không biên dịch được tools/index"; exit 1; }
test -f .test-build/runtime/lark/systemPrompt.js || { echo "✗ không biên dịch được systemPrompt"; exit 1; }
fail=0
for t in test/versionHint.basic.cjs test/versionHint.offline.cjs test/apiRunner.image.cjs test/apiRunner.fallback.cjs test/toolClassifier.cjs test/larkDeleteSync.cjs test/parallelTurns.cjs test/grantScope.cjs test/draftSession.cjs test/attachOffice.cjs test/scheduleDue.cjs test/scheduledSession.cjs test/answerActions.cjs test/hostedTenants.cjs test/hostedEmptyBackup.cjs test/skillContract.cjs test/skillRun.cjs test/agentTurnGuards.cjs test/schedNoSelfSchedule.cjs test/fileBuild.cjs test/fileGuards.cjs test/fileDeliver.cjs test/fileEvent.cjs test/chatTurn.cjs test/larkAppTools.cjs test/cliVersion.cjs test/i18nBanner.cjs test/larkUiDriver.cjs test/larkTemplates.cjs test/larkLoginState.cjs test/workflowV3.cjs test/larkWeb.cjs test/workflowInternal.cjs test/quickAsks.cjs test/larkMerge.cjs test/endpointCompat.cjs test/toolswaveMigrate.cjs test/claudeSessions.cjs test/larkWebWrite.cjs test/localFiles.cjs test/autoFiles.cjs test/skillsBuiltin.cjs test/skillLearning.cjs; do
  echo "── $t"
  node "$t" || fail=1
done
exit $fail
