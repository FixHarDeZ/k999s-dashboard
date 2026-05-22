# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when operating in this repository.

## 📌 Memory & Documentation Rules (Strict)

* **Before Task:** อ่านไฟล์ใน `.notes/` directory นั้นๆ ก่อนเริ่มงานเสมอ
* **After Task:** สรุปสิ่งที่ทำลงใน `.notes/daily_log.md` ทุกครั้งที่จบงาน
* **Every Session End:** อัปเดตข้อมูลที่เปลี่ยนไป (DB schema, API, settings, gaps) ใน `.notes/00_INDEX.md` ควบคู่กับ log เสมอ และทำ Notion Sync ต่อโดยไม่ต้องถามว่าจะทำไหม (ไม่มีข้อยกเว้น ไม่ต้องรอ structural change)
* **Notion Sync:** บันทึกขึ้น Notion ด้วยคำสั่ง: `python3 scripts/sync_notion.py "[Title]" "[Content]"`

## 🛠️ Commands

### Development & Build
- **Hot Reload:** `make dev` (Go backend `:8080` + Vite dev server `:5173` ควบคู่กัน)
- **Production Build:** `make build` (คอมไพล์ React -> ฝังลง Go binary -> ได้ไฟล์ `./k999s` ~47MB)
- **Run Binary:** `./k999s --port 8080 --kubeconfig ~/.kube/config`
- *⚠️ สำคัญ:* หลังแก้ไข React ต้องรัน `make build` ทุกครั้ง เพราะ binary จะฝัง snapshot ณ เวลาที่ compile เท่านั้น

### Testing & Lint
- **All Tests:** `make test` (รันทั้ง Go และ Frontend)
- **Go Only:** `go test ./...`
- **Go Package:** `go test ./internal/k8s/... -v`
- **Go Single Test:** `go test ./internal/k8s/... -run TestDeletePod -v`
- **Frontend Only:** `cd web && npx vitest run` (*ต้องรันจากโฟลเดอร์ `web/` เท่านั้น เนื่องจาก path alias `@` ถูกคอนฟิกไว้ใน `web/vite.config.ts`*)
- **Frontend Single File:** `cd web && npx vitest run src/lib/api.test.ts`
- **TypeScript Check:** `cd web && npx tsc --noEmit`
- **Linting:** `golangci-lint run`

## 🏗️ Architecture & Project Gotchas

### Directory Layout & Build Flow
- โฟลเดอร์ Output ของ Vite คือ `internal/frontend/dist` (ตั้งค่าผ่าน `build.outDir` ใน `web/vite.config.ts`) **ไม่ใช่** `web/dist`
- ฝัง Frontend เข้าไปใน Go ด้วยระบบ `go:embed all:dist` ภายใน `internal/frontend/frontend.go`
- `internal/frontend/dist` เป็น gitignored — `git add internal/frontend/dist/` จะ fail; dist ถูก embed ตอน build เท่านั้น
- `node_modules/.vite/vitest/...` ถูก track ใน git — อาจขึ้น dirty หลัง run vitest; แก้ด้วย `git checkout -- <path>` ก่อน tag

### Go Package Breakdown
- `internal/config`: โหลดสเปกจาก `~/.k999s/config.yaml` และ kubeconfig
- `internal/k8s`: `client.go` (Read/List) และ `actions.go` (Mutate) Wrapping `kubernetes.Interface`
- `internal/api`: Gin Router & Handlers (ใน Test คอนฟิก `hub` เป็น `nil` ได้)
- `internal/ws`: WebSocket hub สำหรับจัดการส่งข้อมูล JSON ผ่าน `Broadcast(type, data)`
- `internal/helm`: wraps `helm` CLI via `os/exec` — ไม่มี unit tests (ไม่สามารถ mock exec ได้); `go build ./...` คือ gate เดียว
- **New endpoint pattern:** `types.go` → `client.go` (หรือ `actions.go` สำหรับ mutation) → `handlers.go` → `router.go`

### React Frontend
- `src/lib/api.ts`: จัดการ HTTP Fetch ทั้งหมด (`get<T>()` สำหรับอ่าน, `action()` สำหรับแก้ไข)
- `src/lib/types.ts`: สเปก TypeScript ที่ล้อตาม Go Summary Types
- `src/hooks/useWebSocket.ts`: Hook สำหรับ Auto-reconnect และ dispatch message
- **Context Filtering:** ทุก Page ใช้ `useOutletContext` ในการกรอง Namespace และต้องครอบด้วย Null-safe (`?? ''`) เสมอ
- **URL-param pages:** Page ที่ได้ namespace จาก URL (เช่น NamespaceDetail) ใช้ `useParams` แทน `useOutletContext` ได้ — ไม่ต้องใช้ outlet context
- **Sidebar icons:** ต้อง import icon ใน `Sidebar.tsx` line 2 เสมอ — lucide icons ไม่มี auto-import

### Go Testing Gotcha
- `fake.NewSimpleClientset` ไม่รองรับ FieldSelector — ถ้า test code ใช้ field selector (เช่น `spec.nodeName=<name>`) fake client จะ return ทุก object; ออกแบบ test fixtures ให้ทุก object อยู่บน target node เสมอ

### Tailwind v4 Styling Quirk
- **ห้ามขยาย Theme ใน `tailwind.config.ts` (ไม่ได้ใช้งานแล้วใน v4)**
- การทำ Custom colors ต้องประกาศผ่าน `@theme {}` ในไฟล์ `src/index.css` เท่านั้น เช่น:
  ```css
  @import "tailwindcss";
  @theme { --color-primary-600: #4f46e5; }