# todo

One list. One someday. One text file. Bring your agent.

<img src="docs/phone.jpg" alt="todo on a phone: a short list with square boxes, a scribe button, and a heat map of done days" width="380">

A to-do list that behaves like a note. Every line is editable in place and saves when you stop typing. Boxes are the only controls. A scribe, which is whatever AI agent you already have, rewrites the lines you logged into outcomes when you ask it to, and asks you instead of guessing when a line could go two ways. The file is plain text, so the phone app, the command line, and any agent edit the same thing.

## The opinion

- **Outcomes, not tasks.** The scribe turns `call alex about the deck` into `ALEX CALLED ABOUT THE DECK.` A headline states a checkable state of the world.
- **One place, one someday.** No projects, no tags, no priorities, no dates. Write `someday`, `maybe`, `sometime`, or `later` in a line and it moves down. Write `now` or `today` and it comes back.
- **Done has a definition.** Checking a box asks: another person can use it, read it, or buy it?
- **Type first, clean later.** Return logs the line in your words. Scribe is a button for whenever you want the logged lines cleaned. Undo is the safety net.
- **The file is the truth.** Export is the file. Import is the file. Agents edit the file.

## Quickstart

You need Node 20 or newer. An agent is optional: without one, the scribe copies its prompt for whatever AI you carry and you paste the reply back.

```
git clone https://github.com/heymitch/todo && cd todo
node cli/todo serve
```

Open http://127.0.0.1:8791. Type a line, press Return. Open settings and pick your agent: `claude` for Claude Code, `codex`, `hermes`, `grok`, or `paste`. Press **test** to see it answer.

For the phone, put the server on your tailnet and add the page to your home screen:

```
tailscale serve --bg --https=8790 http://127.0.0.1:8791
```

Then open `https://<machine>.<tailnet>.ts.net:8790/` on the phone and use Add to Home Screen. To keep the server running at login, see `install/`.

## How it works

**A note that knows what a checkbox is.** Tap a line, type, stop. It saves half a second after you stop typing and again when you leave the line. Return logs a new line. Backspace on an empty line deletes it. Escape leaves a line. On the desktop, `N` focuses the add line, `T` cycles themes, `,` opens settings.

**The scribe.** One prompt in `scribe.js`. It takes your raw lines and asks for items in the file format, with rules that forbid adding names, numbers, or facts. It goes through three doors:

1. **Paste.** With no agent, the scribe button copies the prompt. Paste it into any AI. Paste the reply into any line and the app files it.
2. **CLI.** `todo scribe --via codex` pipes the prompt to an agent command on stdin and reads stdout. Any command that does that works.
3. **Server.** `todo serve` runs the same command for the phone app.

A deterministic guard flags any number or content word in a scribed item that was not in your lines. Flags underline. They never block.

**When the scribe is not sure, it asks.** A line with two plausible outcomes comes back as a question with complete items as options, shown as a menu over the list. Number keys, `j` and `k`, Return, or a tap pick one. Escape keeps your words. At most two questions per scribe, never about wording.

**The heat map.** One square per day for the last year, pinned to the bottom of the screen: checked boxes plus your real GitHub contributions, with commits weighing double. Counts come through the GitHub CLI's login on the server machine, cached for an hour. Set the login in settings. Without it, the map shows checked boxes only.

## The format

```
## Todo

* [ ] **ALEX CALLED ABOUT THE DECK.** Ask about the budget first. Source: notes/deck.md
* [ ] call sam about the video
* [x] **QUARTERLY GOALS WRITTEN DOWN.** Done: 2026-09-13

## Someday

* [ ] **RUST LEARNED.**
```

A bold line is scribed. A plain line is raw. `Source:` is an optional pointer. `Done:` is stamped when you check the box. Files with other headings fold into Todo.

## Settings

A config file, rendered. Five rows.

- **agent.** A preset or the paste door. Saved on the server in `.todo.json` next to your file. **test** asks the agent for one word.
- **github.** The login for the heat map.
- **server.** The file and host when `todo serve` serves the page. A second line takes another server's URL, for a copy of the page hosted elsewhere.
- **theme.** Eight swatches. Themes are data; structure is law. See `DESIGN.md`.
- **file.** Export, copy, import, the scribe prompt, delete all, and the raw text.

## CLI

```
todo                                  open items, numbered
todo list --all
todo add "call alex by friday"        raw line, as written
todo add "learn rust" --someday
todo done 3
todo scribe [--via codex] [--dry]     clean the raw lines in the file
todo capture dump.txt                 clean outside text and add the result
todo prompt                           print the prompt for your raw lines
todo import reply.md                  merge items already in the format
todo config via hermes                agent preset, or a command in quotes
todo config github <login>
todo serve [--port 8791] [--host 127.0.0.1]
todo raw | todo path
```

`TODO_FILE` sets the file, default `~/todo.md`. `TODO_CONFIG` sets the config. `npm link` puts `todo` on your PATH. Presets: `claude -p`, `codex exec --skip-git-repo-check -`, `hermes -z "$(cat)"`, `grok -p "$(cat)"`.

## Read this before you host it

- The server has no login. It is meant to live on a private network such as a tailnet. Anyone who can reach it can read and write your file and run your agent with your credentials.
- The app can switch between preset agents and the paste door over the network. It can never send a shell command. A custom command is set only on the machine that runs the server, with `todo config via '<command>'`. Keep it that way.
- The server answers with permissive CORS so a copy of the page hosted elsewhere can talk to it. On a private network that is fine. On the open internet it is not.

## Widget

`widget/todo-widget.js` is a home-screen widget for Scriptable on iOS. It reads `/api/summary` from your server and shows the open count, the next lines, and the streak. Set `SERVER` at the top of the script.

## Files

- `index.html` the page and the design contract: twelve theme tokens, one structure.
- `app.js` the human door.
- `format.js` parse, serialize, merge, absorb, inference, guard.
- `scribe.js` the prompt, the agent presets, reply cleaning.
- `cli/todo` the CLI and the server. No dependencies.
- `sw.js`, `manifest.json`, `icon.svg` install and offline.
- `test/` deterministic seams: `node --test`.
- `install/` a launchd plist and a systemd unit.

## Status

Single user. Tested on iOS Safari as a home-screen app and on desktop Chromium. One write at a time with a change check; last write wins. No sync when the page runs without a server. Editing on two devices at once will surprise you.

## License

MIT. Copyright Mitch Harris.
