from pathlib import Path

path = Path('src/commands.js')
text = path.read_text(encoding='utf-8')
result = []
state = 'code'
escape = False
template_depth = 0
stack = []
i = 0
n = len(text)

while i < n:
    c = text[i]
    nxt = text[i + 1] if i + 1 < n else ''

    if state == 'code':
        if c == '/' and nxt == '/':
            result.append('//')
            i += 2
            state = 'line_comment'
            continue
        if c == '/' and nxt == '*':
            result.append('/*')
            i += 2
            state = 'block_comment'
            continue
        if c == "'":
            result.append(c)
            state = 'single'
            i += 1
            continue
        if c == '"':
            result.append(c)
            state = 'double'
            i += 1
            continue
        if c == '':
            result.append(c)
            state = 'template'
            stack.append(0)
            i += 1
            continue
        if c == '\\' and nxt == 'n':
            result.append('\n')
            i += 2
            continue
        result.append(c)
        i += 1
        continue

    if state == 'line_comment':
        result.append(c)
        if c == '\n':
            state = 'code'
        i += 1
        continue

    if state == 'block_comment':
        result.append(c)
        if c == '*' and nxt == '/':
            result.append('/')
            i += 2
            state = 'code'
            continue
        i += 1
        continue

    if state == 'single':
        result.append(c)
        if escape:
            escape = False
        elif c == '\\':
            escape = True
        elif c == "'":
            state = 'code'
        i += 1
        continue

    if state == 'double':
        result.append(c)
        if escape:
            escape = False
        elif c == '\\':
            escape = True
        elif c == '"':
            state = 'code'
        i += 1
        continue

    if state == 'template':
        result.append(c)
        if escape:
            escape = False
            i += 1
            continue
        if c == '\\':
            escape = True
            i += 1
            continue
        if c == '':
            state = 'code'
            stack.pop()
            i += 1
            continue
        if c == '$' and nxt == '{':
            result.append('{')
            stack[-1] += 1
            i += 2
            state = 'template_expr'
            continue
        i += 1
        continue

    if state == 'template_expr':
        result.append(c)
        if c == '{':
            stack[-1] += 1
        elif c == '}':
            stack[-1] -= 1
            if stack[-1] == 0:
                state = 'template'
        i += 1
        continue

path.write_text(''.join(result), encoding='utf-8')
