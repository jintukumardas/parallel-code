import { createSignal, onMount, onCleanup, Show, Switch, Match } from 'solid-js';
import { initAuth, getPairedToken, clearPairedToken } from './auth';
import { connect, reconnect, agents } from './ws';
import { createTerminal, ApiError } from './api';
import { AgentList } from './AgentList';
import { AgentDetail } from './AgentDetail';
import { ConnectScreen } from './ConnectScreen';
import { PairScreen } from './PairScreen';
import { NewTaskScreen } from './NewTaskScreen';

type View = 'list' | 'detail' | 'pair' | 'newtask';

interface NavState {
  view: View;
  agentId?: string;
  taskName?: string;
}

function isNavState(v: unknown): v is NavState {
  return typeof v === 'object' && v !== null && typeof (v as NavState).view === 'string';
}

export function App() {
  const [authed, setAuthed] = createSignal(false);
  // Separate view state from detail data so the agentId/taskName signals
  // never become empty while AgentDetail is still mounted (avoids reactive
  // race where Show disposes children *after* props re-evaluate to null).
  const [view, setView] = createSignal<View>('list');
  const [detailAgentId, setDetailAgentId] = createSignal('');
  const [detailTaskName, setDetailTaskName] = createSignal('');
  // Where to land after pairing: the New Task form, back to the agent the
  // user was about to type into, or on to opening a new terminal.
  const [afterPairing, setAfterPairing] = createSignal<View | 'terminal'>('newtask');
  const [openingTerminal, setOpeningTerminal] = createSignal(false);
  const [terminalError, setTerminalError] = createSignal<string | null>(null);

  // Mirror views into browser history so the system back gesture (Android
  // back, iOS edge swipe) returns to the task list instead of leaving the
  // app. History holds at most two entries of ours: the list, and one entry
  // above it that is replaced as the user moves between non-list screens.
  function navigate(next: View) {
    const state: NavState = {
      view: next,
      agentId: detailAgentId(),
      taskName: detailTaskName(),
    };
    const current = view();
    setView(next);
    if (next === current) return;
    if (next === 'list') {
      // Pop our entry; popstate re-applies 'list' (already set above).
      if (isNavState(history.state) && history.state.view !== 'list') history.back();
    } else if (current === 'list') {
      history.pushState(state, '');
    } else {
      history.replaceState(state, '');
    }
  }

  onMount(() => {
    history.replaceState({ view: 'list' } satisfies NavState, '');
    const onPopState = (e: PopStateEvent) => {
      const state: NavState = isNavState(e.state) ? e.state : { view: 'list' };
      if (state.view === 'detail') {
        // Forward navigation back into a task we no longer have details for.
        if (!state.agentId) {
          setView('list');
          return;
        }
        setDetailAgentId(state.agentId);
        setDetailTaskName(state.taskName ?? '');
      }
      setView(state.view);
    };
    window.addEventListener('popstate', onPopState);
    onCleanup(() => window.removeEventListener('popstate', onPopState));
  });

  function selectAgent(id: string, name: string) {
    setDetailAgentId(id);
    setDetailTaskName(name);
    navigate('detail');
  }

  // Creating a task needs the elevated paired token; pair first if we don't
  // have one yet.
  function startNewTask() {
    setAfterPairing('newtask');
    navigate(getPairedToken() ? 'newtask' : 'pair');
  }

  // Typing into a terminal (or saving notes) needs the paired token too. The
  // socket reconnects with it after pairing (see ws.ts), so returning to the
  // detail view is enough.
  function pairForDetail() {
    setAfterPairing('detail');
    navigate('pair');
  }

  // Opening a terminal needs the paired token too. The desktop spawns the
  // shell once its panel mounts, so wait for it to show up in the agent list
  // before opening it.
  async function openNewTerminal() {
    if (openingTerminal()) return;
    if (!getPairedToken()) {
      setAfterPairing('terminal');
      navigate('pair');
      return;
    }
    setOpeningTerminal(true);
    setTerminalError(null);
    try {
      const { agentId } = await createTerminal();
      const deadline = Date.now() + 10_000;
      for (;;) {
        const agent = agents().find((a) => a.agentId === agentId);
        if (agent) {
          if (view() === 'list') selectAgent(agent.agentId, agent.taskName);
          return;
        }
        if (Date.now() > deadline) {
          setTerminalError('Terminal opened on the desktop, but it has not started yet.');
          return;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    } catch (e) {
      // 401/403: stale paired token (desktop restarted); pair again.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        clearPairedToken();
        setAfterPairing('terminal');
        navigate('pair');
        return;
      }
      setTerminalError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpeningTerminal(false);
    }
  }

  // A fresh paired token must also reach the socket, which authenticated with
  // whichever token it had at connect time.
  function onPaired() {
    reconnect();
    const next = afterPairing();
    if (next === 'terminal') {
      navigate('list');
      void openNewTerminal();
    } else {
      navigate(next);
    }
  }

  function onConnected() {
    setAuthed(true);
    connect();
  }

  onMount(() => {
    const token = initAuth();
    if (token) onConnected();
  });

  return (
    <Show when={authed()} fallback={<ConnectScreen onConnected={onConnected} />}>
      <Switch
        fallback={
          <AgentList
            onSelect={selectAgent}
            onNewTask={startNewTask}
            onNewTerminal={() => void openNewTerminal()}
            openingTerminal={openingTerminal()}
            terminalError={terminalError()}
          />
        }
      >
        <Match when={view() === 'detail'}>
          <AgentDetail
            agentId={detailAgentId()}
            taskName={detailTaskName()}
            onBack={() => navigate('list')}
            onNeedsPairing={pairForDetail}
          />
        </Match>
        <Match when={view() === 'pair'}>
          <PairScreen
            onPaired={onPaired}
            onCancel={() => navigate(afterPairing() === 'detail' ? 'detail' : 'list')}
          />
        </Match>
        <Match when={view() === 'newtask'}>
          <NewTaskScreen
            onCreated={() => navigate('list')}
            onCancel={() => navigate('list')}
            onNeedsPairing={() => {
              setAfterPairing('newtask');
              navigate('pair');
            }}
          />
        </Match>
      </Switch>
    </Show>
  );
}
