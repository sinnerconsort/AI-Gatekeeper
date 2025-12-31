# AI Gatekeeper Extension

**The unseen hand behind the story.**

AI Gatekeeper is a SillyTavern extension that acts as a shadow Game Master, making your roleplay world feel alive without requiring constant direction from you. It keeps secrets, plants seeds, and lets you *discover* the story rather than always driving it.

## The Problem It Solves

Traditional card-based roleplay puts all creative burden on the user. Characters are reactive, goals are static, and the world only moves when you poke it. This leads to:

- Creative burnout from constantly driving the plot
- Flat characters who never surprise you
- Stories that feel like work rather than exploration
- Diminishing returns on engagement

## What Gatekeeper Does

Gatekeeper runs silently alongside your chat, reading the scene and whispering to characters. It:

- **Plants seeds** — subtle details that pay off later
- **Keeps secrets** — characters know things you don't
- **Maintains threads** — tracks brewing conflicts and evolving motivations
- **Creates surprises** — introduces events, NPCs, and revelations at the right moment
- **Matches your tone** — adapts to cozy slice-of-life or high-stakes thriller

**You never see the Gatekeeper's instructions.** You only see characters acting on them, responding to a world that has texture and depth.

## Installation

1. Copy the `ai-gatekeeper` folder to your SillyTavern extensions directory:
   ```
   SillyTavern/data/default-user/extensions/third-party/ai-gatekeeper
   ```

2. Restart SillyTavern or reload extensions

3. Enable the extension in the Extensions panel

## Configuration

### Gatekeeper Profile
Select which AI profile/connection the Gatekeeper uses. This can be different from your character models — use a reasoning-focused model for better narrative decisions.

### World Settings

| Setting | Options | Effect |
|---------|---------|--------|
| **Setting** | Realistic, Low Fantasy, High Fantasy, Sci-Fi, Blended | What elements can be introduced |
| **Tone** | Cozy, Drama, Thriller, Horror, Dark, Chaotic | How intense interventions can be |
| **Pacing** | Slow Burn, Balanced, Escalating, Volatile | How quickly tension builds |
| **Chaos Factor** | 1-5 | How unpredictable the Gatekeeper acts |

### Story Seeds

You can plant seeds — suggestions for where you want the story to go:

- "His past catches up with him"
- "Something goes wrong at the festival"  
- "Build toward a betrayal"

The Gatekeeper will find natural ways to make these happen. You know *something* is coming, but not when or how.

## How It Works

```
You send a message
       ↓
Gatekeeper analyzes (hidden API call)
       ↓
Decides: whisper / plant / nudge / spawn / hold
       ↓
Injects hidden context into character prompt
       ↓
Character responds, influenced but unaware
       ↓
You experience the world moving
```

### Action Types

| Action | What It Does |
|--------|--------------|
| **WHISPER** | Give character secret knowledge to act on |
| **PLANT** | Have character mention a subtle detail (seed for later) |
| **NUDGE** | Shift character's emotional state or priorities |
| **SPAWN** | Introduce new element through character's perspective |
| **HOLD** | Do nothing — scene doesn't need intervention |

## The GM Document

Gatekeeper maintains a hidden "GM Document" per chat that tracks:

- **Active threads** — secrets, tensions, brewing conflicts
- **Planted seeds** — details introduced and what they're building toward
- **Character states** — how they've evolved beyond their cards
- **Knowledge map** — who knows what
- **World state** — what's confirmed to exist, current tension level

This persists across sessions, so threads can pay off much later.

## Multi-Model Integration

Gatekeeper exposes a global `window.AIGatekeeper` object for integration with Multi-Model Chat:

```javascript
// Get injection text for a specific character
const injection = window.AIGatekeeper.getInjectionForCharacter('Astarion');

// Manually trigger Gatekeeper analysis
await window.AIGatekeeper.callGatekeeper();

// Add a user seed programmatically
window.AIGatekeeper.addUserSeed('Something should go wrong');
```

## Tips

1. **Start with Chaos Factor low** — let Gatekeeper learn your story before getting wild

2. **Plant specific seeds** — "His past catches up" is better than "something happens"

3. **Trust the pacing** — not every turn needs intervention; let scenes breathe

4. **Check the status** — see how many threads are active, what the last action was

5. **Let it cook** — the payoffs come when you're not expecting them

## Troubleshooting

**Gatekeeper not activating:**
- Check that it's enabled in settings
- Verify a profile is selected
- Check browser console for errors

**Interventions feel random:**
- Lower the Chaos Factor
- Make sure Setting/Tone match your story
- The GM Document builds context over time — it gets better

**Characters acting weird:**
- The injection might be too heavy-handed
- Try adjusting Tone to something less intense

## Credits

Built by Judas, designed for creative writers who want to be surprised by their own stories again.

---

*"You are not here to control the story. You're here to make it feel like the story has a life of its own."*
