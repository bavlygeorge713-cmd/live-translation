import {
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Globe, LogOut, Moon, Sun, X } from "lucide-react";
import { Header } from "@/components/Header";
import { GlassCard } from "@/components/ui/GlassCard";
import { RButton, SectionLabel } from "@/components/ui/redesign";
import { useAuth } from "@/contexts/AuthContext";

const DRAWER_ID = "host-drawer";

/**
 * A DOM element a component renders into through a portal. Create it once per host (useState initializer) and never replace
 * it: a new portal container remounts everything inside it. `display: contents` keeps it out of the layout, so the portal's
 * children are laid out as direct children of wherever the slot is attached.
 */
export function createSlot(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "contents";
  return el;
}

/** Attaches a slot (see createSlot) into the page once. Always rendered, never conditional. */
export function SlotHost({ slot }: { slot: HTMLElement }) {
  const attach = useCallback(
    (host: HTMLDivElement | null) => {
      if (host && slot.parentNode !== host) host.appendChild(slot);
    },
    [slot],
  );
  return <div ref={attach} className="contents" />;
}

interface ChromeProps {
  roomName?: string;
  connected: boolean;
  /** Controls kept in the top bar (between the room title and the menu button). */
  bar: ReactNode;
  /** Everything else; lives in the drawer. */
  children: ReactNode;
}

/**
 * Top bar + menu drawer. The open/closed state lives here so that opening or closing the drawer re-renders only the bar and the
 * drawer shell: `bar` and `children` are elements created by the parent, which React reuses untouched.
 */
export function HostChrome({ roomName, connected, bar, children }: ChromeProps) {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="sticky top-0 z-40">
      <Header
        roomName={roomName}
        connected={connected}
        menuOpen={open}
        onToggleMenu={toggle}
        menuButtonRef={menuButtonRef}
        drawerId={DRAWER_ID}
      >
        {bar}
      </Header>
      <HostDrawer
        id={DRAWER_ID}
        open={open}
        onClose={close}
        menuButtonRef={menuButtonRef}
      >
        {children}
      </HostDrawer>
    </div>
  );
}

interface DrawerProps {
  id: string;
  open: boolean;
  onClose: () => void;
  menuButtonRef: RefObject<HTMLButtonElement>;
  children: ReactNode;
}

/**
 * Slide-in panel on the right, directly under the top bar. Its content is always mounted: closed means hidden (CSS) and
 * `inert`, never unmounted, so the components inside keep running. It overlays the page instead of pushing it, so the
 * caption canvas never changes size.
 */
function HostDrawer({ id, open, onClose, menuButtonRef, children }: DrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // `inert` keeps hidden controls out of the tab order and the accessibility tree (React 18 has no prop for it).
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [open]);

  // Keyboard users land inside the drawer when it opens.
  useEffect(() => {
    if (open) closeButtonRef.current?.focus({ preventScroll: true });
  }, [open]);

  const closeAndRestoreFocus = useCallback(() => {
    if (panelRef.current?.contains(document.activeElement)) {
      menuButtonRef.current?.focus({ preventScroll: true });
    }
    onClose();
  }, [menuButtonRef, onClose]);

  // Esc and a press anywhere outside the drawer (the menu button toggles it on its own) close it.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAndRestoreFocus();
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, onClose, closeAndRestoreFocus, menuButtonRef]);

  return (
    <div className="host-drawer-layer">
      <div
        aria-hidden="true"
        className={`host-drawer-scrim ${open ? "is-open" : ""}`}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        id={id}
        aria-label="Host menu"
        className={`host-drawer ${open ? "is-open" : ""}`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-app px-5">
          <h2 className="text-[14px] font-semibold text-primary">Menu</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeAndRestoreFocus}
            aria-label="Close menu"
            title="Close menu"
            className="focus-ring grid size-9 place-items-center rounded-[10px] text-secondary transition-colors hover:bg-[var(--surface-2)] hover:text-primary"
          >
            <X className="size-[18px]" />
          </button>
        </div>
        <div className="thin-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
      </aside>
    </div>
  );
}

/** Room name and code (the connection badge and the audience count stay in the top bar). */
export function DrawerRoomCard({
  roomName,
  roomId,
}: {
  roomName?: string;
  roomId: string;
}) {
  return (
    <GlassCard>
      <SectionLabel>Room</SectionLabel>
      <div className="truncate text-[15px] font-semibold text-primary">
        {roomName ?? "Conference Translator"}
      </div>
      <div className="mt-1 truncate font-mono text-[12px] text-tertiary">
        {roomId}
      </div>
    </GlassCard>
  );
}

/** Shell theme toggle, engine label and log out (they used to sit in the header). */
export function DrawerAccountCard({
  isDark,
  onToggleTheme,
}: {
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const auth = useAuth();
  const themeLabel = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <GlassCard className="flex flex-col gap-4">
      <SectionLabel>Appearance &amp; account</SectionLabel>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-primary">Theme</p>
          <p className="mt-0.5 text-[11px] text-tertiary">
            {isDark ? "Dark" : "Light"} host console
          </p>
        </div>
        <RButton
          variant="secondary"
          size="sm"
          onClick={onToggleTheme}
          title={themeLabel}
          aria-label={themeLabel}
        >
          {isDark ? (
            <Sun className="size-4 shrink-0" />
          ) : (
            <Moon className="size-4 shrink-0" />
          )}
          {isDark ? "Light" : "Dark"}
        </RButton>
      </div>
      <div className="flex items-center gap-1.5 text-[12px] text-tertiary">
        <Globe className="size-3.5 shrink-0" />
        <span>Web Speech · Online Translation</span>
      </div>
      {auth && (
        <RButton variant="secondary" onClick={auth.onLogout} title="Log out">
          <LogOut className="size-4 shrink-0" />
          Log out
        </RButton>
      )}
    </GlassCard>
  );
}
