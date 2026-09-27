#!/usr/bin/env python3
"""Turn the supplied knowledge base into a small, independently playable task catalog.

Run with: python3 scripts/generate_catalog.py '/path/to/knowledge_base.json'
The merged knowledge_base.json is the source of truth. No textbook page extracts are copied.
"""

import json
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit('用法：python3 scripts/generate_catalog.py /path/to/knowledge_base.json')
SOURCE = Path(sys.argv[1])
OUT = ROOT / 'src/data/catalog.json'


def choice(prompt, options, answer, hint, explanation):
    assert answer in options and len(set(options)) == len(options)
    return dict(kind='choice', prompt=prompt, options=options, answer=answer,
                hint=hint, explanation=explanation)


def number(prompt, answer, hint, explanation):
    return dict(kind='number', prompt=prompt, answer=answer, hint=hint,
                explanation=explanation)


def order(prompt, items, answer, hint, explanation):
    assert sorted(items) == sorted(answer)
    return dict(kind='order', prompt=prompt, items=items, answer=answer,
                hint=hint, explanation=explanation)


def match(prompt, pairs, hint, explanation):
    return dict(kind='match', prompt=prompt, pairs=pairs, answer=pairs,
                hint=hint, explanation=explanation)


def tiles(prompt, target, icon, hint, explanation):
    return dict(kind='tiles', prompt=prompt, target=target, icon=icon,
                answer=target, hint=hint, explanation=explanation)


def comparison_text(a, b):
    word = '大于' if a > b else '小于' if a < b else '等于'
    return f'{a} {word} {b}。'


def three_choice(rows):
    return [choice(*row) for row in rows]


def chinese_auto(k):
    kid = k['kp_id']
    if kid == 'YW1-U1-L1-KP02':
        return three_choice([
            ('老师问“谁要回答？”，你指着自己说哪个字？', ['我', '你', '他'], '我', '说自己，用“我”。', '“我”指说话的自己。'),
            ('你对好朋友说话，称呼对方用哪个字？', ['我', '你', '他'], '你', '对面的人是“你”。', '“你”指正在听你说话的人。'),
            ('小明不在说话的人里面，提到小明用哪个字？', ['我', '你', '他'], '他', '说到另一个男孩，用“他”。', '“他”指谈话中提到的其他人。'),
        ])
    if kid == 'YW1-U2-L1-KP02':
        return three_choice([
            ('找出 a 的第二声。', ['ā', 'á', 'ǎ', 'à'], 'á', '第二声从低往高扬。', 'á 是 a 的第二声。'),
            ('找出 o 的第三声。', ['ō', 'ó', 'ǒ', 'ò'], 'ǒ', '第三声先降再升。', 'ǒ 是 o 的第三声。'),
            ('找出 e 的第四声。', ['ē', 'é', 'ě', 'è'], 'è', '第四声向下降。', 'è 是 e 的第四声。'),
        ])
    if kid == 'YW1-U2-L2-KP02':
        return three_choice([
            ('i 标第一声后，写成哪一个？', ['ī', 'í', 'ǐ', 'ì'], 'ī', 'i 标调时去掉上面的小点。', 'ī 是 i 的第一声，点要去掉。'),
            ('u 的第二声写成哪一个？', ['ū', 'ú', 'ǔ', 'ù'], 'ú', '第二声向上扬。', 'ú 是 u 的第二声。'),
            ('ü 的第四声写成哪一个？', ['ǖ', 'ǘ', 'ǚ', 'ǜ'], 'ǜ', '第四声向下降。', 'ǜ 是 ü 的第四声。'),
        ])
    if kid == 'YW1-U3-L6-KP02':
        return three_choice([
            ('j 和 ü 拼在一起，音节怎样写？', ['ju', 'jü', 'jue'], 'ju', '小 ü 碰到 j，去掉两点。', 'j + ü 写成 ju。'),
            ('q 和 ü 拼在一起，音节怎样写？', ['qu', 'qü', 'qiu'], 'qu', '小 ü 碰到 q，去掉两点。', 'q + ü 写成 qu。'),
            ('x 和 ü 拼在一起，音节怎样写？', ['xu', 'xü', 'xiu'], 'xu', '小 ü 碰到 x，去掉两点。', 'x + ü 写成 xu。'),
        ])
    if kid == 'YW1-U4-L10-KP02':
        return three_choice([
            ('ui 标第二声，声调放在哪里？', ['uí', 'úi', 'ūi'], 'uí', 'i 和 u 在一起，声调标在后一个字母上。', 'ui 的后一个字母是 i，所以写作 uí。'),
            ('iu 标第二声，声调放在哪里？', ['iú', 'íu', 'iū'], 'iú', 'i 和 u 在一起，声调标在后一个字母上。', 'iu 的后一个字母是 u，所以写作 iú。'),
            ('ui 标第四声，哪一个写法正确？', ['uì', 'ùi', 'ūi'], 'uì', '看一看 ui 的后一个字母。', 'ui 标在 i 上，写作 uì。'),
        ])
    if kid in ('YW1-U3-L10-KP04', 'YW2-U2-L1-KP03'):
        return [match('把事物和合适的量词连起来。', pairs, '先在嘴里读一读完整短语。', explanation) for pairs,explanation in [
            ([{'left':'大山','right':'座'},{'left':'大树','right':'棵'},{'left':'小鸟','right':'只'}], '一座大山、一棵大树、一只小鸟。'),
            ([{'left':'小桥','right':'座'},{'left':'鲜花','right':'朵'},{'left':'小鸡','right':'只'}], '一座小桥、一朵鲜花、一只小鸡。'),
            ([{'left':'大树','right':'棵'},{'left':'白云','right':'朵'},{'left':'高山','right':'座'}], '一棵大树、一朵白云、一座高山。'),
        ]]
    if kid == 'YW2-U3-L7-KP03':
        return three_choice([
            ('“你今天开心吗”句末放什么标点？', ['。', '？', '！'], '？', '这是在提问题。', '问句末尾用问号。'),
            ('“今天天气真好”句末放什么标点？', ['。', '？', '，'], '。', '这是说完一句话。', '陈述句末尾可以用句号。'),
            ('“太棒了”句末放什么标点？', ['。', '？', '！'], '！', '读出高兴的语气。', '表达强烈感情时可用感叹号。'),
        ])
    if kid == 'YW2-U8-L24-KP02':
        return three_choice([
            ('小猫叫起来，是哪一个声音词？', ['喵喵', '汪汪', '哗哗'], '喵喵', '想一想小猫的叫声。', '小猫常发出“喵喵”的声音。'),
            ('小狗叫起来，是哪一个声音词？', ['叽叽', '汪汪', '沙沙'], '汪汪', '想一想小狗的叫声。', '小狗常发出“汪汪”的声音。'),
            ('大雨落在地上，可以用哪个声音词？', ['哗哗', '喵喵', '咚咚'], '哗哗', '听一听雨声。', '大雨常发出“哗哗”的声音。'),
        ])
    return None


def arithmetic(k):
    kid, name = k['kp_id'], k['name']
    if kid.startswith('SX1'):
        if kid == 'SX1-U1-L9-KP02':
            return [number(q,a,'加上 0 不变；减去 0 也不变。',e) for q,a,e in [
                ('3 + 0 = ?',3,'3+0=3。'),('0 + 5 = ?',5,'0+5=5。'),('4 - 0 = ?',4,'4-0=4。')]]
        if kid == 'SX1-U2-L3-KP01':
            return [number(f'{a} + {b} = ?',a+b,'把两部分合起来。',f'{a}+{b}={a+b}。') for a,b in [(2,4),(3,4),(5,4)]]
        if kid == 'SX1-U2-L4-KP01':
            return [number(f'{a} - {b} = ?',a-b,'从总数里拿走一部分。',f'{a}-{b}={a-b}。') for a,b in [(6,2),(8,3),(9,4)]]
        if kid == 'SX1-U2-L7-KP01':
            return [number(q,a,'从左往右一步一步算。',e) for q,a,e in [
                ('2 + 3 + 1 = ?',6,'2+3+1=6。'),('9 - 2 - 3 = ?',4,'9-2-3=4。'),('4 + 3 - 2 = ?',5,'4+3-2=5。')]]
        if kid == 'SX1-U2-L7-KP02':
            return [number(q,a,'先想第一步，再想第二步。',e) for q,a,e in [
                ('树上有 3 只鸟，又飞来 2 只，再飞来 1 只，现在有几只？',6,'3+2+1=6 只。'),
                ('有 8 块饼干，吃掉 2 块，又吃掉 3 块，还剩几块？',3,'8-2-3=3 块。'),
                ('盒里有 4 颗糖，放进 3 颗，又拿走 2 颗，还剩几颗？',5,'4+3-2=5 颗。')]]
        if kid == 'SX1-U7-L1-KP02':
            return [number(f'{a} + {b} + □ = 10，第三张卡片是多少？',c,'先算前两张一共是多少。',f'{a}+{b}+{c}=10。') for a,b,c in [(2,3,5),(1,6,3),(4,2,4)]]
        if kid == 'SX1-U5-L3-KP02':
            return [number(q,a,'十位上的 1 不变，算个位。',e) for q,a,e in [
                ('12 + 3 = ?',15,'12+3=15。'),('18 - 4 = ?',14,'18-4=14。'),('13 + 5 = ?',18,'13+5=18。')]]
        if not any(s in name for s in ('计算', '口算', '连加', '连减', '加减混合', '求未知加数', '和是10', '10减几', '十几加几', '十几减几', '十几加减几', '凑成10', '填数使每条线')):
            return None
        if any(s in name for s in ('方法与联系', '整理', '讲', '设计', '规则')):
            return None
        if '凑成10' in name or '未知加数' in name or '填数使每条线' in name:
            values = [(3, 7), (6, 4), (8, 2)]
            return [number(f'{a} + □ = 10，方框里填几？', b, '想一想还差几才到 10。', f'{a} 加 {b} 等于 10。') for a, b in values]
        if '连加' in name:
            values = [(2, 1, 3), (1, 4, 2), (3, 2, 4)]
            return [number(f'{a} + {b} + {c} = ?', a+b+c, '从左往右一步一步算。', f'先算 {a}+{b}，再加 {c}，得 {a+b+c}。') for a,b,c in values]
        if '连减' in name:
            values = [(8, 3, 2), (9, 4, 1), (7, 2, 3)]
            return [number(f'{a} - {b} - {c} = ?', a-b-c, '从左往右一步一步算。', f'先算 {a}-{b}，再减 {c}，得 {a-b-c}。') for a,b,c in values]
        if '加减混合' in name:
            values = [(5, 3, 2), (7, 2, 4), (3, 5, 1)]
            return [number(f'{a} + {b} - {c} = ?', a+b-c, '先加，再减。', f'{a}+{b}={a+b}，再减 {c}，得 {a+b-c}。') for a,b,c in values]
        if '十几加' in name:
            values = [(11, 3), (14, 2), (12, 5)]
            return [number(f'{a} + {b} = ?', a+b, '个位相加，十位上的 1 不变。', f'{a}+{b}={a+b}。') for a,b in values]
        if '十几减' in name:
            values = [(16, 3), (18, 5), (17, 2)]
            return [number(f'{a} - {b} = ?', a-b, '从个位减起。', f'{a}-{b}={a-b}。') for a,b in values]
        if '19以内' in name or '本册' in name:
            values = [('15 + 3', 18), ('18 - 4', 14), ('12 + 5', 17)]
            return [number(f'{p} = ?', a, '可以把十位和个位分开想。', f'{p} = {a}。') for p,a in values]
        if '和是10' in name:
            values = [(2, 8), (6, 4), (7, 3)]
            return [number(f'{a} + {b} = ?', 10, '两数合起来正好是 10。', f'{a}+{b}=10。') for a,b in values]
        if '10减几' in name:
            values = [(10, 3), (10, 7), (10, 4)]
            return [number(f'{a} - {b} = ?', a-b, '想一想 10 可以分成几和几。', f'{a}-{b}={a-b}。') for a,b in values]
        limit = 5 if '5以内' in name or kid.startswith('SX1-U1') else 9 if '9以内' in name or kid.startswith('SX1-U2') else 10
        if '减法' in name and '加减' not in name:
            values = [(limit, 2), (limit-1, 3), (limit-2, 1)]
            return [number(f'{a} - {b} = ?', a-b, '可以想一想分与合。', f'{a}-{b}={a-b}。') for a,b in values]
        if '加减' in name:
            values = [(2, 3, '+'), (limit, 2, '-'), (1, min(limit-1, 5), '+')]
            return [number(f'{a} {op} {b} = ?', a+b if op=='+' else a-b, '看清加号或减号。', f'{a}{op}{b}={a+b if op=="+" else a-b}。') for a,b,op in values]
        values = [(1, 2), (2, min(3,limit-2)), (1, min(4,limit-1))]
        return [number(f'{a} + {b} = ?', a+b, '把两部分合在一起。', f'{a}+{b}={a+b}。') for a,b in values]
    if kid.startswith('SX2'):
        if '两位数' in name and any(s in name for s in ('加', '减', '计算')) and not any(s in name for s in ('关系', '方法', '实际问题', '整理')):
            if '不进位' in name:
                values = [(23, 14, '+'), (42, 35, '+'), (61, 27, '+')]
            elif '进位' in name and '不进位' not in name:
                values = [(27, 15, '+'), (38, 24, '+'), (46, 37, '+')]
            elif '不退位' in name:
                values = [(58, 23, '-'), (74, 32, '-'), (96, 45, '-')]
            elif '退位' in name and '不退位' not in name:
                values = [(52, 27, '-'), (71, 36, '-'), (63, 28, '-')]
            else:
                values = [(27, 15, '+'), (74, 32, '-'), (63, 28, '-')]
            return [number(f'{a} {op} {b} = ?', a+b if op=='+' else a-b, '个位对个位，十位对十位。', f'{a}{op}{b}={a+b if op=="+" else a-b}。') for a,b,op in values]
    return None


def math_auto(k):
    kid, name = k['kp_id'], k['name']
    if kid.startswith('SX1'):
        if kid in ('SX1-U0-L2-KP01', 'SX1-U1-L1-KP01', 'SX1-U1-L2-KP01', 'SX1-U2-L1-KP01'):
            ns = [1, 2, 3] if kid == 'SX1-U1-L1-KP01' else [4, 5, 4] if kid == 'SX1-U1-L2-KP01' else [6, 8, 9] if kid == 'SX1-U2-L1-KP01' else [3, 5, 7]
            icons = [('●','圆点'),('◆','菱形'),('▲','三角形')]
            return [number(f'数一数：{icons[i][0]*n} 一共有几个{icons[i][1]}？', n, '一个一个点着数，不要漏掉。', f'一共有 {n} 个{icons[i][1]}。') for i,n in enumerate(ns)]
        if kid == 'SX1-U0-L2-KP03':
            return [tiles(f'把 {n} 颗星星放进篮子。', n, '⭐', '点一次就放进一颗星星。', f'篮子里正好有 {n} 颗星星。') for n in (3,5,7)]
        if kid == 'SX1-U1-L1-KP02':
            return [number(q,a,'每次向后数一个，就多 1。',e) for q,a,e in [
                ('1 后面是几？',2,'1 后面是 2。'),('2 后面是几？',3,'2 后面是 3。'),('3 前面是几？',2,'3 前面是 2。')]]
        if kid == 'SX1-U1-L2-KP02':
            return [number(q,a,'数一数相邻的三个数。',e) for q,a,e in [
                ('4 前面是几？',3,'4 前面是 3。'),('4 后面是几？',5,'4 后面是 5。'),('5 前面是几？',4,'5 前面是 4。')]]
        if kid == 'SX1-U4-L1-KP02':
            return [number(q,a,'从 8 往后数一数。',e) for q,a,e in [
                ('9 后面是几？',10,'9 后面是 10。'),('10 前面是几？',9,'10 前面是 9。'),('8、9、□，方框里填几？',10,'8、9、10，依次多 1。')]]
        if kid in ('SX1-U1-L4-KP02','SX1-U2-L1-KP02','SX1-U5-L1-KP03','SX1-U8-L1-KP01'):
            sets = {
                'SX1-U1-L4-KP02': [[0,2,1],[3,5,4],[1,4,2]],
                'SX1-U2-L1-KP02': [[6,8,7],[7,9,8],[6,9,8]],
                'SX1-U5-L1-KP03': [[11,13,12],[16,14,15],[18,17,19]],
                'SX1-U8-L1-KP01': [[0,10,5],[11,13,12],[19,17,18]],
            }[kid]
            return [order('把数字从小到大排好。', list(map(str,reversed(ns))), [str(n) for n in sorted(ns)], '先找最小的数。', '从小到大是：'+'、'.join(map(str,sorted(ns)))+'。') for ns in sets]
        if kid == 'SX1-U2-L1-KP04':
            return three_choice([
                ('下面哪个数离 8 最近？', ['3','7','5'], '7', '比一比它们到 8 还差几。', '7 离 8 只差 1。'),
                ('下面哪个数离 6 最近？', ['5','2','9'], '5', '比一比它们到 6 还差几。', '5 离 6 只差 1。'),
                ('下面哪个数离 9 最近？', ['8','4','5'], '8', '比一比它们到 9 还差几。', '8 离 9 只差 1。'),
            ])
        if kid == 'SX1-U1-L5-KP01':
            return three_choice([
                ('左边 ●●●，右边 ★★★★。一一配对后哪边有剩余？', ['左边','右边','都不剩'], '右边', '每个圆点连一颗星星，看看哪边还没配上。', '3 个圆点配 3 颗星，右边还剩 1 颗。'),
                ('左边 ●●●●●，右边 ★★★。一一配对后哪边有剩余？', ['左边','右边','都不剩'], '左边', '每个圆点连一颗星星。', '5 个圆点配 3 颗星，左边还剩 2 个。'),
                ('左边 ●●●●，右边 ★★★★。一一配对后怎样？', ['左边有剩余','右边有剩余','都不剩'], '都不剩', '一对一连完后数数两边。', '两边各有 4 个，正好一样多。'),
            ])
        if kid == 'SX1-U1-L6-KP01':
            return three_choice([
                ('数一数 ●●●●，应写哪个数字？', ['3','4','5'], '4', '一个一个点着数。', '四个圆点写作 4。'),
                ('数字 5 应读作什么？', ['三','四','五'], '五', '想一想五根手指。', '5 读作“五”。'),
                ('3 □ 5，方框里填什么？', ['>','=','<'], '<', '先比较 3 和 5 哪个多。', '3 小于 5。'),
            ])
        if any(s in name for s in ('大小比较','比较数的大小','用符号表示数的大小关系','认识大于号和小于号')):
            rows=[(6,8),(9,7),(8,8)] if kid.startswith('SX1-U2') else [(3,5),(5,2),(4,4)]
            return [choice(f'{a} □ {b}，方框里填什么？', ['>','=','<'], '>' if a>b else '<' if a<b else '=', '先想想哪一边更多。', comparison_text(a, b)) for a,b in rows]
        if kid == 'SX1-U1-L3-KP01':
            return three_choice([
                ('排队时“小兔排第 3”，说的是多少只，还是位置？', ['位置', '总数', '颜色'], '位置', '“第几”说的是位置。', '第 3 表示小兔所在的位置。'),
                ('桌上有 4 个苹果，“4 个”说的是什么？', ['总数', '位置', '方向'], '总数', '“几个”说的是数量。', '4 个表示苹果的总数。'),
                ('小熊排在第 2 位，应该数到第几个？', ['第1个', '第2个', '第3个'], '第2个', '从队伍起点开始数。', '排第 2 就是数到第 2 个。')])
        if kid == 'SX1-U3-L3-KP01':
            return three_choice([
                ('哪个形状像篮球？', ['球', '圆柱', '正方体'], '球', '篮球圆滚滚。', '篮球的形状像球。'),
                ('哪个形状像骰子？', ['球', '正方体', '圆柱'], '正方体', '骰子的面方方正正。', '骰子的形状像正方体。'),
                ('哪个形状像饮料罐？', ['圆柱', '球', '长方体'], '圆柱', '上下是圆圆的面。', '饮料罐的形状像圆柱。')])
    else:
        if kid == 'SX2-U1-L1-KP01':
            return [number(f'有 {n} 组，每组 {m} 个苹果，一共有几个？', n*m, '可以写成相同加数连加。', f'{n} 个 {m} 相加，得 {n*m}。') for n,m in [(3,2),(4,3),(5,2)]]
        if kid == 'SX2-U1-L1-KP02':
            return [choice(f'{add} 可以写成哪个乘法算式？', opts, ans, '看一看有几个相同的加数。', f'{add}={ans}。') for add,opts,ans in [
                ('2+2+2', ['2×3','2×2','3×3'], '2×3'),
                ('4+4+4+4', ['4×4','4×3','3×3'], '4×4'),
                ('5+5+5', ['5×3','5×5','3×3'], '5×3')]]
        if kid == 'SX2-U1-L2-KP02':
            return three_choice([
                ('在 3×4=12 中，12 叫什么？', ['积','乘数','乘号'], '积', '乘法的结果叫积。', '12 是积。'),
                ('在 3×4=12 中，3 叫什么？', ['乘数','积','加数'], '乘数', '乘号两边的数叫乘数。', '3 是乘数。'),
                ('在 3×4=12 中，“×”叫什么？', ['乘号','加号','等号'], '乘号', '它表示相乘。', '“×”是乘号。')])
        if kid == 'SX2-U1-L7-KP01':
            return [number(f'{a} × {b} = ?',a*b,'想一想 2、3、4 的乘法口诀。',f'{a}×{b}={a*b}。') for a,b in [(2,3),(3,4),(4,2)]]
        if kid == 'SX2-U1-L7-KP02':
            return [number(q,a,'同一行相邻的口诀，积按相同的数增加。',e) for q,a,e in [
                ('2×3=6，接着 2×4 = ?',8,'6 再加 2 等于 8。'),
                ('3×4=12，接着 3×5 = ?',15,'12 再加 3 等于 15。'),
                ('4×5=20，接着 4×6 = ?',24,'20 再加 4 等于 24。')]]
        if kid == 'SX2-U4-L4-KP01':
            return [number(q,a,'想一想 7 和 8 的乘法口诀。',e) for q,a,e in [
                ('7 × 3 = ?',21,'7×3=21。'),('56 ÷ 8 = ?',7,'8×7=56，所以 56÷8=7。'),('8 × 6 = ?',48,'8×6=48。')]]
        if kid == 'SX2-U4-L5-KP02':
            return [number(q,a,'几个 9 比对应的几十少几。',e) for q,a,e in [
                ('3 个 9 比 30 少 3，9 × 3 = ?',27,'30-3=27。'),
                ('6 个 9 比 60 少 6，9 × 6 = ?',54,'60-6=54。'),
                ('8 个 9 比 80 少 8，9 × 8 = ?',72,'80-8=72。')]]
        if kid == 'SX2-U4-L6-KP01':
            return [number(q,a,'用 7～9 的口诀想一想。',e) for q,a,e in [
                ('7 × 8 = ?',56,'七八五十六。'),('72 ÷ 9 = ?',8,'九八七十二。'),('8 × 9 = ?',72,'八九七十二。')]]
        if kid == 'SX2-U4-L6-KP02':
            return [number(q,a,'按从左往右的顺序计算。',e) for q,a,e in [
                ('2 × 3 × 4 = ?',24,'2×3=6，6×4=24。'),
                ('48 ÷ 6 ÷ 2 = ?',4,'48÷6=8，8÷2=4。'),
                ('7 × 4 ÷ 2 = ?',14,'7×4=28，28÷2=14。')]]
        if kid == 'SX2-U4-L7-KP01':
            return [number(q,a,'观察口诀表里同一行的积。',e) for q,a,e in [
                ('7×2=14，7×3=21，7×4 = ?',28,'每次多 7，得到 28。'),
                ('8×3=24，8×4=32，8×5 = ?',40,'每次多 8，得到 40。'),
                ('9×4=36，9×5=45，9×6 = ?',54,'每次多 9，得到 54。')]]
        if kid == 'SX2-U10-L1-KP01':
            return [number(q,a,'想一想对应的乘法口诀。',e) for q,a,e in [
                ('7 × 6 = ?',42,'七六四十二。'),('56 ÷ 8 = ?',7,'八七五十六。'),('9 × 8 = ?',72,'八九七十二。')]]
        if kid == 'SX2-U10-L3-KP01':
            return [number(q,a,'回想乘除法和数位的知识。',e) for q,a,e in [
                ('7 × 8 = ?',56,'7×8=56。'),
                ('4 个百、2 个十、6 个一组成几？',426,'组成 426。'),
                ('56 ÷ 7 = ?',8,'7×8=56，所以商是 8。')]]
        if kid == 'SX2-U10-L4-KP02':
            return [number(q,a,'观察相邻口诀的积。',e) for q,a,e in [
                ('9×2=18，9×3=27，9×4 = ?',36,'每次多 9，得到 36。'),
                ('7×4=28，7×5=35，7×6 = ?',42,'每次多 7，得到 42。'),
                ('8×5=40，8×6=48，8×7 = ?',56,'每次多 8，得到 56。')]]
        if kid in ('SX2-U5-L1-KP01','SX2-U5-L1-KP02','SX2-U5-L2-KP01','SX2-U5-L2-KP02'):
            if kid == 'SX2-U5-L2-KP01':
                return three_choice([
                    ('小明在小红的东边，小红在小明的哪边？', ['西','东','南','北'], '西', '站在小明的位置想一想。', '小红在小明的西边。'),
                    ('书店在公园的北边，公园在书店的哪边？', ['南','北','东','西'], '南', '方向反过来。', '公园在书店的南边。'),
                    ('学校在家里的西边，家在学校的哪边？', ['东','西','南','北'], '东', '西的相反方向是东。', '家在学校的东边。')])
            return three_choice([
                ('早晨太阳升起的方向是？', ['东','南','西','北'], '东', '想一想太阳从哪边升起。', '太阳从东方升起。'),
                ('面向东时，背后是哪边？', ['东','南','西','北'], '西', '背后是相反方向。', '东的相反方向是西。'),
                ('面向北时，右手边是哪边？', ['东','南','西','北'], '东', '想象自己面向北站着。', '面向北时右手边是东。')])
        if kid == 'SX2-U6-L2-KP02':
            return three_choice([
                ('342 读作什么？', ['三百四十二','三百二十四','四百三十二'], '三百四十二', '先读百位，再读十位和个位。', '342 读作三百四十二。'),
                ('507 读作什么？', ['五百零七','五百七十','五百七'], '五百零七', '十位没有数，要读一个“零”。', '507 读作五百零七。'),
                ('860 读作什么？', ['八百六十','八百零六','六百八十'], '八百六十', '个位是 0，不用读出来。', '860 读作八百六十。')])
        if kid in ('SX2-U6-L2-KP01','SX2-U6-L5-KP01','SX2-U10-L1-KP02'):
            return [number(f'{h} 个百、{t} 个十、{o} 个一，合起来是几？', h*100+t*10+o, '先写百位，再写十位和个位。', f'合起来是 {h*100+t*10+o}。') for h,t,o in [(2,3,4),(5,0,7),(8,6,1)]]
        if kid == 'SX2-U6-L3-KP02':
            return [choice(f'{a} □ {b}，方框里填什么？', ['>','=','<'], '>' if a>b else '<' if a<b else '=', '先比较百位。', comparison_text(a, b)) for a,b in [(342,324),(507,570),(681,681)]]
        if kid in ('SX2-U8-L1-KP02','SX2-U10-L3-KP02'):
            return [number(q,a,'1 元 = 10 角，1 角 = 10 分。',e) for q,a,e in [
                ('2 元等于多少角？',20,'2 元 = 20 角。'),
                ('5 角等于多少分？',50,'5 角 = 50 分。'),
                ('3 元等于多少角？',30,'3 元 = 30 角。')]]
        if kid == 'SX2-U8-L3-KP01':
            return [number(f'买一件 {price} 元的商品，付 10 元，应找回几元？',10-price,'用付的钱减去商品价格。',f'10-{price}={10-price} 元。') for price in (3,6,8)]
        if kid == 'SX2-U9-L2-KP01':
            return three_choice([
                ('除数是 5，余数可能是几？', ['4','5','6'], '4', '余数必须比除数小。', '4 小于 5，可以作余数。'),
                ('除数是 7，余数可能是几？', ['6','7','8'], '6', '余数必须比除数小。', '6 小于 7，可以作余数。'),
                ('除数是 4，余数可能是几？', ['3','4','5'], '3', '余数必须比除数小。', '3 小于 4，可以作余数。')])
        if kid.startswith('SX2-U9') and any(s in name for s in ('算式','试商','计算')):
            return [choice(f'{a} ÷ {b} = ?（商……余数）', opts, ans, '先找最接近但不超过被除数的倍数。', f'{a}={b}×{q}+{r}，所以商 {q} 余 {r}。') for a,b,q,r,opts,ans in [
                (14,4,3,2,['3……2','2……3','4……1'],'3……2'),
                (17,5,3,2,['3……2','2……3','4……1'],'3……2'),
                (23,6,3,5,['3……5','4……1','2……6'],'3……5')]]
        mult = any(s in name for s in ('乘法口诀','乘法口算','乘除法口算','口诀计算','乘法计算','口诀求商','口诀试商','用 5 的口诀','用 7 的口诀','用 8 的口诀','用 9 的口诀','表内乘除法','连乘'))
        div = any(s in name for s in ('除法口算','求商','除法熟练','表内除法'))
        if mult or div:
            fixed = 5 if '5 的' in name else 6 if '6 的' in name else 7 if '7 的' in name else 8 if '8 的' in name else 9 if '9 的' in name else None
            pairs = [(fixed or 2,3),(fixed or 4,4),(fixed or 6,5)]
            if div:
                return [number(f'{a*b} ÷ {a} = ?', b, f'想一想 {a} 乘几等于 {a*b}。', f'{a}×{b}={a*b}，所以商是 {b}。') for a,b in pairs]
            return [number(f'{a} × {b} = ?', a*b, '可以想对应的乘法口诀。', f'{a}×{b}={a*b}。') for a,b in pairs]
    return arithmetic(k)


INTRO = {
    '朗读背诵':'大声读一读，再试着不看提示说一遍',
    '口语交际':'对着探险伙伴清楚地说一说',
    '写字':'在画板或纸上写一写',
    '习作':'先想一想，再写一写',
    '阅读理解':'读懂小提示，再用自己的话回答',
    '拼音':'读一读、拼一拼，留意口形和声调',
    '识字':'看一看、读一读，再试着组词',
    '语言积累':'用这个词语或句式说一句话',
    '图形与几何':'摆一摆、看一看，再讲出你的发现',
    '综合实践':'动手做一做，再说出你的方法',
    '数与运算':'用小圆片或手指摆一摆，再说出做法',
    '数量关系':'先找出已知的数量，再说说怎样解答',
    '整理与复习':'回想学过的办法，试着自己完成',
    '数学文化':'读读小提示，再讲给探险伙伴听',
    '综合性学习':'看一看、想一想，再说出自己的发现',
}

PRACTICE_OVERRIDES = {
    'YW1-U0-L1-KP02': '原创小情境：阿丽、乐乐和小明来自不同的民族，今天一起去上学。想一想他们有什么共同的家园，再说一句完整的话。',
    'YW1-U0-L1-KP03': '站直身体，对着探险伙伴说：“你好！我叫____，我是中国人。”再换一种亲切的语气说一次。',
    'YW1-U0-L2-KP02': '听一听四个名字：五星红旗、天安门、长江、黄河。试着说出其中两个，再告诉伙伴哪一个是我们的国旗。',
    'YW1-U0-L2-KP03': '想一件你喜欢的东西，例如一本故事书。说一句完整的话：“我爱____，因为____。”',
    'YW1-U0-L3-KP03': '想象明天去上学：说出书包里要带的两样东西，再说一句“我今天觉得____”。',
    'YW1-U0-L4-KP01': '听一听四件语文活动：读书、写字、讲故事、听故事。用手指按顺序数一数，再说出其中两件。',
    'YW1-U0-L4-KP02': '现在试一试：背挺直，双脚放好。拿起一本书读一句话，再拿笔写一个字，看看眼睛离纸是不是太近。',
    'YW1-U0-L4-KP03': '从读书、写字、讲故事、听故事中选一件，说：“我最喜欢____，因为____。”',
    'SX1-U0-L2-KP02': '画三颗星星和两个月亮。先给星星和月亮一对一连线，再说哪种图形多、多几个。',
    'SX1-U0-L3-KP01': '找一个小纸盒当积木，再画两个圆形和一个正方形。说说你用了哪几种形状、每种几个。',
    'SX1-U0-L3-KP02': '在纸上画两个三角形和一个圆，拼成一幅小画。说说每种形状用了几个。',
    'SX1-U0-L4-KP01': '在纸上先画一个小方框，再画一个更大的方框。指一指哪个更大，说出你是怎么比较的。',
    'SX1-U0-L4-KP02': '在纸上画两个小点。先画一条弯弯的路连接它们，再画一条直路，比一比哪条更短。',
}

CHECK_OVERRIDES = {
    'YW1-U0-L1-KP02': '我能说出不同民族的小朋友都生活在中国。',
    'YW1-U0-L2-KP02': '我能说出两个祖国标志性事物的名字，知道五星红旗是国旗。',
    'YW1-U0-L4-KP01': '我能说出读书、写字、讲故事、听故事中的至少两件事。',
    'YW1-U0-L4-KP02': '我能坐端正读书，并注意握笔和眼睛离纸的距离。',
    'SX1-U0-L3-KP01': '我能说出自己用了哪些形状，每种有几个。',
    'SX1-U0-L3-KP02': '我能说出小画里每种形状各有几个。',
    'SX1-U0-L4-KP01': '我能画出两个封闭图形，指出更大的一个并说出理由。',
}


def recognition_targets(k):
    candidates = []
    for segment in re.findall('“([^”]+)”', k['mastery'] + ' ' + k['content']):
        tokens = [token.strip() for token in segment.split('、')]
        if len(tokens) >= 2 and all(1 <= len(token) <= 5 and not re.search('[（）()—]', token) for token in tokens):
            all_single = all(len(token) == 1 for token in tokens)
            candidates.append((all_single, len(tokens), tokens))
    if candidates:
        if any(word in k['name'] for word in ('词语','字词','名称','车船','天气')):
            candidates.sort(key=lambda item: (item[1], item[0]), reverse=True)
        else:
            candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
        return candidates[0][2]
    return []


def original_practice(k):
    """Short game-only material, separate from the source knowledge summary."""
    name, kind = k['name'], k['type']
    pick = int(hashlib.sha256(k['kp_id'].encode()).hexdigest()[:8], 16)
    if k['kp_id'] in PRACTICE_OVERRIDES:
        return PRACTICE_OVERRIDES[k['kp_id']]
    if k['kp_id'] == 'YW1-U0-L1-KP01':
        return '原创朗读小句：“我住在中国。这里有高山，也有大海。我们一起快乐学习。”指着字读两遍，再试着说一遍。'
    if k['kp_id'] == 'YW1-U0-L2-KP01':
        return '原创朗读小句：“我爱我的家。我爱窗前的小树。”先读慢一点，再连起来读。'
    if kind == '朗读背诵':
        if '分角色' in name or '对话' in name:
            return '原创对话：“小鸟：你要去哪里？小兔：我要去看花。”试着用两种声音读给伙伴听。'
        if '问句' in name or '问号' in name:
            return '原创对话：“小熊，你看见我的小帽子了吗？”“在书架上！”先读出提问，再读出回答。'
        lines = [
            '小雨轻轻落，青草点点头。',
            '风吹小纸船，慢慢过小桥。',
            '早晨云儿白，树上鸟儿来。',
            '月亮照窗台，小猫静静睡。',
        ]
        return f'原创朗读小句：“{lines[pick % len(lines)]}”先读两遍，再试着不看屏幕说一遍。练熟后，可按教材页码对照「{name}」。'
    if kind == '拼音':
        letters = re.findall(r'[a-zü]+', name.lower())
        focus = '、'.join(dict.fromkeys(letters)) if letters else '今天学的音节'
        return f'小嘴巴练习：慢慢读出 {focus}，再读给身边的人听。先读准，再读快。'
    if kind == '写字':
        quoted = re.findall('“([^”]+)”', k['content']) or re.findall('“([^”]+)”', name)
        targets = '、'.join(ch for ch in ''.join(quoted) if '\u4e00' <= ch <= '\u9fff')
        return f'小小书法家：{("把“" + targets + "”里的字") if targets else "把今天要学的字"}在画板上各写一遍；选一个字，说一个自己想到的词。'
    if kind == '识字':
        if name.startswith('认读'):
            targets = recognition_targets(k)
            if targets:
                words = '、'.join(targets)
                extra = '；再选两个词说说它们的意思' if any(len(token) > 1 for token in targets) else '；再选两个字各组一个词'
                if any(word in k['mastery'] for word in ('会写','书写','正确写')):
                    extra += '；最后把要求会写的字写在画板上'
                return f'识字小侦探：指着字词读一读：{words}{extra}。'
        quoted = re.findall('“([^”]+)”', name)
        targets = '、'.join(ch for ch in ''.join(quoted) if '\u4e00' <= ch <= '\u9fff')
        return f'识字小侦探：找出{("“" + targets + "”中的字") if targets else "今天的新字"}，指着字读给伙伴听，再试着说一个含这个字的词。'
    if kind == '口语交际':
        return f'想象探险伙伴就在面前，围绕「{name}」说两句话。先说清楚发生了什么，再说说自己的想法。'
    if kind == '习作':
        if '留言' in name:
            return '原创情境：你去找小伙伴借一本故事书，他不在家。写一张留言条，说清你来过、想借什么、你是谁。'
        if '玩具' in name:
            return '原创情境：你有一辆会跑的小车。写出它的颜色、玩法，以及你为什么喜欢它。'
        return '原创情境：小兔在路边发现一把蓝色雨伞。想一想接下来发生什么，写两三句完整的话。'
    if kind == '阅读理解':
        if '水' in name or '雨' in name or '云' in name:
            return '原创小故事：早上，草叶上挂着水珠。太阳出来后，水珠慢慢不见了。想一想它可能去了哪里，再说说理由。'
        if '方位' in name or '方向' in name or '影子' in name:
            return '原创小故事：小鹿朝着太阳站好，影子落在它的身后。说说太阳、影子和小鹿的位置。'
        if '顺序' in name or '复述' in name or '经过' in name:
            return '原创小故事：小熊先种下一粒豆，接着浇水，最后看见嫩芽。按先后顺序把三件事讲一遍。'
        stories = [
            '原创小故事：小兔把半块面包分给小鸟，小鸟说了声谢谢。想一想小兔做了什么，为什么。',
            '原创小故事：下雨了，小猫把自己的小伞借给小狗。说说故事里有谁，发生了什么。',
            '原创小故事：小松鼠捡到一颗种子，埋进土里，天天给它浇水。猜猜后来会怎样。',
        ]
        return stories[pick % len(stories)]
    if kind == '语言积累':
        return f'自己造一个新句子来练习「{name}」。可以从“今天我看见……”开头，把想说的话补完整。'
    if kind == '综合性学习':
        return f'观察身边的一样东西，围绕「{name}」说出一个发现，再讲给探险伙伴听。'
    if kind == '图形与几何':
        if any(word in name for word in ('长方体','正方体','圆柱','球','立体')):
            return f'看看身边的纸盒、水杯和皮球。找出与「{name}」有关的形状，用手指一指，再说说它能不能滚动。'
        if any(word in name for word in ('左','右','前','后','上','下','位置','方位','方向')):
            return '把一支铅笔放在书的左边，再移到书的右边。指一指位置，换一种说法介绍给伙伴。'
        return f'在纸上画一个小图，或用纸片摆一摆，试着完成「{name}」，并指出你发现的形状。'
    if kind == '数量关系':
        if any(word in name for word in ('减','剩','另一部分','其中一部分')):
            return '原创小问题：画 5 颗星星，圈掉其中 2 颗。现在还剩几颗？先说已知条件，再说算法。'
        return '原创小问题：画 3 颗星星，再画 2 颗。一共有几颗？先说已知条件，再说算法。'
    if kind == '数与运算':
        if '介绍身边' in name or '描述生活' in name:
            return '看看身边有几本书、几支笔。选一样说完整：“这里有 __ 个 __。”再说说自己今年几岁。'
        if '0' in name or '零' in name:
            return '先在纸上画 3 个圆圈，再把圆圈全部划掉。现在剩几个？试着用数字表示。'
        if '分与合' in name:
            return '画 5 个圆圈，把它们分成左右两组。试两种不同的分法，说说两组各有几个。'
        if any(word in name for word in ('位置','第几','顺序')):
            return '画一排 5 颗星星，从左向右指一指第 3 颗。再数一数这一排一共有几颗。'
        if '乘' in name or '除' in name or '平均分' in name:
            return '画 3 组小圆圈，每组 2 个。先数总数，再想想怎样平均分给 3 个伙伴。'
        if '百' in name or '千' in name or '数位' in name:
            return '在纸上写 234，指着百位、十位和个位，说出每一位上的数字。'
        if '减' in name:
            return '伸出 5 根手指，收回 2 根。还剩几根？边做边把算式说出来。'
        if '加' in name:
            return '先画 2 颗星星，再画 3 颗。数一数总数，边指边把算式说出来。'
        return f'在纸上画五个圆点，围绕「{name}」试着做一个小例子，并把想法说给伙伴听。'
    if kind == '综合实践':
        return f'小小实验：找身边安全、容易移动的物品，试着完成「{name}」，再说说你的发现。'
    if kind == '数学文化':
        return f'给家人讲一个与「{name}」有关的小发现，再找一个生活中的例子。'
    return f'试着做一做「{name}」，用自己的话讲出方法。'


def make_self(k):
    name = k['name']
    task = INTRO.get(k['type'], '试着独立完成')
    mastery = k['mastery'].strip().rstrip('。')
    if mastery.startswith('能'):
        mastery = mastery[1:]
    checklist = [f'我能{mastery}。', '我检查过一遍，也能说出自己是怎么做的。']
    if k['type'] in ('朗读背诵','口语交际','拼音','识字'):
        checklist[1] = '我大声读/说了一遍，并认真听了自己的声音。'
    needs_write = k['type']=='识字' and any(word in k['mastery'] for word in ('会写','书写','正确写'))
    if k['type'] in ('写字','习作') or needs_write:
        checklist[1] = '我对照要求检查了字形、顺序和标点。'
    if k['kp_id'] in CHECK_OVERRIDES:
        checklist[0] = CHECK_OVERRIDES[k['kp_id']]
    original_text_needed = k['type']=='朗读背诵'
    if original_text_needed:
        if '分角色' in name or '对话' in name:
            checklist[0] = '我能用不同的语气读出原创对话里的两位角色。'
            example = '先看说话的是谁，再换一种语气读另一位角色；遇到问号时读出提问的感觉。'
        elif '背诵' in name:
            checklist[0] = '我能把原创小句读清楚，并试着不看屏幕说出来。'
            example = '把小句分成两半，先一句一句读，再连起来说；想不起时可以看一眼提示。'
        else:
            checklist[0] = '我能把原创小句读清楚，遇到标点会停一停。'
            example = '指着字慢慢读；逗号轻轻停一下，句号停久一点，问号读出提问的语气。'
    else:
        example = k['content']
    return dict(mode='self', kind='draw' if k['type'] in ('写字','习作') or needs_write else 'speak' if k['type'] in ('朗读背诵','口语交际','拼音','识字') else 'think',
                instruction=f'来练习「{name}」！{task}。', practice=original_practice(k), example=example, checklist=checklist,
                originalTextNeeded=original_text_needed)


def main():
    kb = json.loads(SOURCE.read_text(encoding='utf-8'))
    volumes, units, lessons, points = [], [], [], []
    for v in kb['volumes']:
        volumes.append(dict(id=v['volume_id'], subject=v['subject'], grade=v['grade'], label=v['subject']+v['volume_label'], edition=v['edition'], unitIds=[u['unit_id'] for u in sorted(v['units'], key=lambda u:u['order'])]))
        for u in sorted(v['units'], key=lambda u:u['order']):
            units.append(dict(id=u['unit_id'], volumeId=v['volume_id'], name=u['unit_name'], goal=u['unit_goal'], order=u['order'], lessonIds=[l['lesson_id'] for l in sorted(u['lessons'], key=lambda l:l['order'])]))
            for lesson in sorted(u['lessons'], key=lambda l:l['order']):
                lessons.append(dict(id=lesson['lesson_id'], unitId=u['unit_id'], name=lesson['lesson_name'], page=lesson['page'], order=lesson['order'], pointIds=[p['kp_id'] for p in lesson['knowledge_points']]))
    for k in kb['knowledge_points']:
        auto = chinese_auto(k) if k['subject']=='语文' else math_auto(k)
        task = dict(mode='auto', kind=auto[0]['kind'], instruction=f'来挑战「{k["name"]}」！认真看题，选出或填出答案。', variants=auto) if auto else make_self(k)
        if auto:
            for i, variant in enumerate(auto):
                variant['audio'] = f'audio/{k["kp_id"]}-{i+1}.mp3'
        else:
            task['audio'] = f'audio/{k["kp_id"]}.mp3'
        points.append(dict(id=k['kp_id'], name=k['name'], type=k['type'], level=k['level'], source=k['source'],
                           volumeId=k['volume_id'], unitId=k['unit_id'], lessonId=k['lesson_id'], order=k['order'],
                           prereq=k['prereq'], leadsTo=k['leads_to'], task=task))
    catalog = dict(version='1.0.0', sourceVersion=kb['meta']['version'], volumes=volumes, units=units, lessons=lessons,
                   points=points, crossGradeLinks=[dict(fromId=c['from_kp'],toId=c['to_kp']) for c in kb['cross_grade_links']])
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    modes={m:sum(p['task']['mode']==m for p in points) for m in ('auto','self')}
    print('wrote',OUT,'points',len(points),'modes',modes)
    for v in volumes:
        ps=[p for p in points if p['volumeId']==v['id']]
        print(v['id'],len(ps),'auto',sum(p['task']['mode']=='auto' for p in ps))


if __name__ == '__main__':
    main()
