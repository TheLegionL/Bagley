from pathlib import Path

path = Path('src/commands.js')
text = path.read_text(encoding='utf-8')
result = []
state_stack = ['code']
escape = False
i = 0
n = len(text)

string_states = {'single', 'double', 'template'}

while i < n:
    c = text[i]
    nxt = text[i + 1] if i + 1 < n else ''
    state = state_stack[-1]

    if state == 'code':
        if c == '/' and nxt == '/':
            result.append('//')
            state_stack.append('line_comment')
            i += 2
            continue
        if c == '/' and nxt == '*':
            result.append('/*')
            state_stack.append('block_comment')
            i += 2
            continue
        if c == "'":
            result.append(c)
            state_stack.append('single')
            i += 1
            continue
        if c == '"':
            result.append(c)
            state_stack.append('double')
            i += 1
            continue
        if c == '`':
            result.append(c)
            state_stack.append('template')
            i += 1
            continue
    elif state in ('single', 'double'):
        result.append(c)
        if escape:
            escape = False
        elif c == '\\':
            escape = True
        elif (state == 'single' and c == "'") or (state == 'double' and c == '"'):
            state_stack.pop()
        i += 1
        continue
    elif state == 'template':
        result.append(c)
        if escape:
            escape = False
            i += 1
            continue
        if c == '\\':
            escape = True
            i += 1
            continue
        if c == '`':
            state_stack.pop()
            i += 1
            continue
        if c == '$' and nxt == '{':
            result.append('{')
            state_stack.append('template_expr')
            i += 2
            continue
        i += 1
        continue
    elif state == 'template_expr':
        result.append(c)
        if c == '{':
            state_stack.append('template_expr')
            i += 1
            continue
        if c == '}':
            state_stack.pop()
            i += 1
            continue
        if c == '\\' and nxt == 'n':
            result.append('\n')
            i += 2
            continue
        continue
    elif state == 'line_comment':
        if c == '\\' and nxt == 'n':
            result.append('\n')
            i += 2
            continue
        result.append(c)
        if c == '\n':
            state_stack.pop()
        i += 1
        continue
    elif state == 'block_comment':
        if c == '\\' and nxt == 'n':
            result.append('\n')
            i += 2
            continue
        result.append(c)
        if c == '*' and nxt == '/':
            result.append('/')
            state_stack.pop()
            i += 2
            continue
        i += 1
        continue

    # default handling for code after the above transitions
    if c == '\\' and nxt == 'n':
        result.append('\n')
        i += 2
        continue

    result.append(c)
    i += 1

path.write_text(''.join(result), encoding='utf-8')
