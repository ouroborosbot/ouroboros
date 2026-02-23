# skills system

drop markdown files here, load them to modify assistant behavior.

## usage

```python
from skills.loader import list_skills, load_skill

# see what's available
print(list_skills())  # ['code-review', 'explain']

# load a skill (returns markdown content)
skill_content = load_skill("code-review")
```

## how it works

1. add a `.md` file to this directory
2. `load_skill()` reads it and returns the content
3. the caller prepends it to the system prompt
4. boom — behavior modified

## existing skills

- **code-review** — brutal, thorough code review
- **explain** — friendly technical explanations
