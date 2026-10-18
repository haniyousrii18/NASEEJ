# دليل الفريق: تثبيت نسيج من GitHub والشغل المنسّق بـ Git

الدليل ده للي هيشتغلوا على المشروع مع بعض. الأوامر مكتوبة بالإنجليزي زي ما هي، والشرح بالعربي. لو عالق في خطوة، شوف جدول المشاكل في آخر الملف.

المستودع: <https://github.com/haniyousrii18/NASEEJ>

---

## 1. القواعد الخمس (احفظها)

1. **ما حدش يشتغل على `main` مباشرة.** كل مهمة في فرع (branch) خاص بيها، وتدخل `main` عن طريق Pull Request.
2. **قبل ما تبدأ أي حاجة: `git pull`.** وقبل ما تفتح PR: حدّث فرعك من `main`.
3. **مهمة واحدة = فرع واحد = Pull Request واحد صغير.** الصغير بيتراجع بسرعة وبيقل فيه التعارض.
4. **ما ترفعش أسرار أبدًا:** `.env` ومفاتيح الـAPI وملفات `storage/` وأي بيانات مرضى حقيقية. البيانات في المشروع كلها تجريبية.
5. **شغّل الاختبارات قبل الـPR.** في GitHub Actions بتشتغل لوحدها على كل PR (ملف `.github/workflows/ci.yml`)، بس لازم تجربها عندك الأول عشان ما تستناش الفشل.

---

## 2. تثبيت المشروع من GitHub (أول مرة)

### المطلوب على جهازك
| البرنامج | النسخة | للتأكد |
|---|---|---|
| Git | أي حديثة | `git --version` |
| Node.js | 20 أو أحدث | `node -v` |
| npm | 10 أو أحدث | `npm -v` |
| PostgreSQL | 16 أو أحدث | `psql --version` |

على ويندوز: ثبّت PostgreSQL من الموقع الرسمي (احفظ كلمة سر المستخدم `postgres` اللي بتختارها وقت التثبيت)، وتأكد إن مجلد `bin` بتاعه في الـPATH عشان `psql` يشتغل.

### الخطوات
```bash
# 1) نزّل المشروع
git clone https://github.com/haniyousrii18/NASEEJ.git
cd NASEEJ

# 2) نزّل المكتبات (مرة واحدة من الجذر، بتثبّت الباك والفرونت)
npm install

# 3) ملف الإعدادات
cp .env.example .env
```
على PowerShell استخدم بدل `cp`: `Copy-Item .env.example .env`

افتح `.env` واكتب كلمة سر PostgreSQL عندك:
```ini
DB_PASSWORD=كلمة_سر_postgres_بتاعتك
```
باقي القيم تبقى زي ما هي لو PostgreSQL على نفس الجهاز وعلى البورت 5432.

```bash
# 4) اعمل قاعدة البيانات مرة واحدة
psql -U postgres -c "CREATE DATABASE naseej_dev;"

# 5) أنشئ الجداول وحمّل البيانات التجريبية
npm --prefix backend run migrate
npm --prefix backend run seed

# 6) شغّل التطبيق (الباك على 5000 والواجهة على 3000)
npm run dev
```
افتح <http://localhost:3000>.

### حسابات تجريبية (كلمة السر لكلها `Password123!`)
| الدور | الإيميل |
|---|---|
| مدير المنصة | `admin@naseej.health` |
| مدير المركز | `manager.noor@naseej.health` |
| طبيب | `doctor.noor@naseej.health` |
| استقبال | `reception.noor@naseej.health` |
| منسّق رعاية | `coordinator.noor@naseej.health` |
| مريض | `patient@naseej.health` |
| مرافق (مفوَّض من المريض) | `caregiver.noor@naseej.health` |

### ميزة الذكاء الاصطناعي (اختيارية)
مقفولة افتراضيًا ومش محتاجها للشغل العادي. لو هتجرّبها: حط في `.env` بتاعك **أنت فقط** إما `AI_PROVIDER=gemini` مع `GEMINI_API_KEY` (مفتاح مجاني من aistudio.google.com)، أو `AI_PROVIDER=anthropic` مع `ANTHROPIC_API_KEY`. الطبقة المجانية من Google ممكن تستخدم الملفات لتحسين منتجاتها، فاستخدم ملفات وهمية بس. المفتاح ما يتبعتش في شات ولا يتكتب في كود. استخدم ملفات تجريبية بس.

---

## 3. توزيع الشغل

كل مهمة ليها **مالك واحد** حتى لو أكتر من واحد بيساعد.

| المحور | يشمل | الملفات الغالبة |
|---|---|---|
| الواجهة | الموقع العام، مساحات الأدوار، RTL/LTR | `frontend/src` |
| الباك إند وقاعدة البيانات | الـAPI، الصلاحيات، عزل المراكز، الـmigrations | `backend/src`, `database/` |
| الذكاء الاصطناعي | قراءة المستندات، المراجعة | `backend/src/services/ai` |
| الجميع | الاختبارات، التوثيق، المراجعة | `backend/tests`, `docs/` |

لو مهمتك هتلمس ملفات شخص تاني، كلّمه قبل ما تبدأ.

---

## 4. روتين الشغل اليومي

### أ) ابدأ من `main` محدّث
```bash
git switch main
git pull
npm install                       # لو package.json اتغير
npm --prefix backend run migrate  # لو في migration جديدة
```

### ب) اعمل فرع للمهمة
```bash
git switch -c feature/reception-calendar
```
أسماء الفروع: `النوع/وصف-قصير-بالإنجليزي`
- `feature/…` ميزة جديدة
- `fix/…` إصلاح خطأ
- `docs/…` توثيق
- `chore/…` ترتيب أو إعدادات

### ج) اشتغل واحفظ على دفعات صغيرة
```bash
git status                        # شوف إيه اللي اتغير
git add backend/src/routes/x.ts   # أضف ملفات محددة، مش git add . بشكل أعمى
git commit -m "feat(reception): add week view to the schedule"
```
صيغة رسالة الـcommit: `النوع(المنطقة): وصف قصير بالإنجليزي`
- الأنواع: `feat` `fix` `docs` `test` `refactor` `chore`
- المناطق: `patient` `doctor` `reception` `manager` `caregiver` `admin` `api` `db` `ai` `ui`
- مثال: `fix(api): refuse expired caregiver delegation`

قبل `git add` بص على `git status`، ولو ظهر `.env` أو `storage/` أو `node_modules` يبقى في غلط (المفروض يكونوا متجاهَلين تلقائيًا).

### د) قبل ما ترفع: اختبر
```bash
npm --prefix frontend run test
npx tsc --noEmit -p backend
npx tsc --noEmit -p frontend
npm --prefix backend run test      # بيغيّر قاعدة البيانات، شوف التحذير تحت
```
اختبارات الباك بتشتغل على قاعدة البيانات الحقيقية اللي في `.env` وبتغيّر فيها. قبل التشغيل الكامل اعمل reset على **قاعدة تطوير بتاعتك بس** (بيمسح بياناتها):
```bash
npm --prefix backend run migrate -- --reset
npm --prefix backend run seed
```

### هـ) حدّث فرعك من `main` قبل الـPR
```bash
git fetch origin
git merge origin/main
```
لو ظهر تعارض، شوف قسم "التعارضات" تحت.

### و) ارفع وافتح Pull Request
```bash
git push -u origin feature/reception-calendar
```
افتح الرابط اللي بيظهر في الترمنال، أو من صفحة المستودع اضغط **Compare & pull request**. في الـPR اكتب:
- إيه اللي اتغير ولية (جملتين تكفي).
- نتيجة الاختبارات اللي شغّلتها (والـPR هيجيله قالب فيه قايمة فحص جاهزة).
- لو في migration: رقمها وهل بتتطبّق على بيانات موجودة.
- لقطة شاشة لو التغيير في الواجهة.

### ز) المراجعة والدمج
- واحد من الفريق (غيرك) يراجع ويوافق قبل الدمج.
- اللي فتح الـPR هو اللي يدمجه بعد الموافقة (**Squash and merge** عشان تاريخ `main` يفضل نضيف).
- بعد الدمج: `git switch main && git pull` وامسح الفرع القديم `git branch -d feature/reception-calendar`.

### قائمة فحص الـPR
- [ ] الفرع متحدّث من `main` وماشي بدون تعارض
- [ ] الاختبارات و`tsc` نجحت عندك، وشغل الـCI أخضر
- [ ] مفيش `.env` أو مفاتيح أو بيانات حقيقية
- [ ] لو غيّرت واجهة: جرّبتها بالعربي (RTL) والإنجليزي ونهاري/ليلي
- [ ] لو غيّرت صلاحيات: الفحص بيتم في الباك مش بإخفاء زر بس
- [ ] التوثيق اتحدّث لو السلوك اتغيّر

---

## 5. قاعدة البيانات (انتبه هنا)

- ملفات التغيير في `database/migrations/` بأرقام متسلسلة: `005_اسم.sql` وهكذا (الرقم 004 مستخدم لجدول الإشعارات).
- **ما تعدّلش migration اتدمجت خلاص.** لو محتاج تغيير، اعمل migration جديدة.
- لو اتنين فتحوا `004` في نفس الوقت، هيحصل تعارض في الرقم. **اتفقوا في الـIssue** مين ياخد الرقم، ولو اتأخرت غيّر رقمك قبل الدمج.
- كل migration تبقى إضافية وآمنة (`IF NOT EXISTS`) ومعاها ملف تراجع في `database/migrations/rollback/`.
- بعد ما تعمل `git pull` وتلاقي migration جديدة: `npm --prefix backend run migrate`.
- بيانات التجربة في `database/seeds/` تجريبية بس.
- ما تعملش `--reset` على قاعدة فيها بيانات عايز تحتفظ بيها.

---

## 6. التعارضات (Merge conflicts)

بتحصل لما اتنين يعدّلوا نفس السطور. ما تخافش منها:
```bash
git fetch origin
git merge origin/main
# Git هيقولك أنهي ملفات فيها تعارض
```
افتح الملف وهتلاقي:
```text
<<<<<<< HEAD
كودك
=======
كود main
>>>>>>> origin/main
```
1. اختار النسخة الصح (أو ادمج الاتنين)، وامسح علامات `<<<<<<<` و`=======` و`>>>>>>>`.
2. شغّل `npx tsc --noEmit -p frontend` و`-p backend` عشان تتأكد إن الكود لسه سليم.
3. ```bash
   git add الملف-اللي-حليته
   git commit            # رسالة الدمج الجاهزة تنفع
   git push
   ```
لو مش متأكد من الحل، اسأل صاحب الكود التاني بدل ما تخمّن.

---

## 7. لو غلطت (حلول آمنة)

| الموقف | الحل |
|---|---|
| عدّلت ملف وعايز ترجّعه | `git restore path/to/file` (بيمسح تعديلاتك في الملف ده) |
| عملت `git add` لملف بالغلط | `git restore --staged path/to/file` |
| عملت commit وعايز تعدّل رسالته ولسه ما رفعتش | `git commit --amend -m "رسالة جديدة"` |
| ارفعت commit غلط فعلًا | `git revert <commit-id>` (بيعمل commit جديد بيلغيه، آمن للفريق) |
| بدأت شغل على `main` بالغلط ولسه ما عملتش commit | `git switch -c feature/اسم` (التعديلات بتيجي معاك للفرع الجديد) |
| ارفعت `.env` أو مفتاح بالغلط | **قول لصاحب المستودع فورًا.** المفتاح لازم يتغيّر حتى لو مسحت الملف، لأنه فضل في التاريخ |

ما تستخدمش `git push --force` ولا `git reset --hard` على فرع مشترك. لو محتاجها اسأل الأول.

---

## 8. مشاكل شائعة

| المشكلة | السبب والحل |
|---|---|
| `password authentication failed` وقت `migrate` | كلمة سر `DB_PASSWORD` في `.env` غلط |
| `database "naseej_dev" does not exist` | ما عملتش `CREATE DATABASE naseej_dev;` |
| `psql` مش معروف | مجلد `bin` بتاع PostgreSQL مش في الـPATH |
| البورت 3000 أو 5000 مشغول | اقفل البرنامج اللي ماسكه، أو غيّر `PORT` في `.env` للباك |
| الواجهة بتفتح بس كل الطلبات بتفشل | الباك مش شغّال، شغّل `npm run dev` من الجذر |
| `relation "caregiver_delegations" does not exist` أو شبهها | في migration جديدة: `npm --prefix backend run migrate` |
| الاختبارات بتفشل بشكل عشوائي بعد تشغيل قبلها | الاختبارات بتغيّر القاعدة: `migrate -- --reset` ثم `seed` |
| بعد `git pull` المشروع بقى بيطلع أخطاء | شغّل `npm install` وبعدها `migrate` |

---

## 9. إعداد المستودع (لصاحب المستودع مرة واحدة)

1. **ضم الفريق:** Settings ← Collaborators ← Add people.
2. **احمي `main`:** Settings ← Branches ← Add branch protection rule لـ`main`:
   - Require a pull request before merging
   - Require approvals: 1
   - Require status checks to pass: اختار **Backend (typecheck and tests)** و**Frontend (typecheck, tests and build)** (بيظهروا في القايمة بعد أول تشغيل للـCI)
   - Do not allow force pushes
3. **اجعل الدمج Squash:** Settings ← General ← Pull Requests ← فعّل Allow squash merging وعطّل الباقي لو عايز تاريخ نضيف.
4. **استخدم Issues:** كل مهمة Issue فيها الوصف ومعايير القبول والمالك والأولوية، والـPR بيشاور عليها (`Closes #12`).
5. **أول رفع للشغل الحالي** (فيه تغييرات كتير غير مرفوعة):
   ```bash
   git status                                  # راجع القائمة، لازم ما يظهرش .env
   git switch -c chore/workspaces-and-docs
   git add -A
   git commit -m "feat: five role workspaces, caregiver delegation, AI review, docs"
   git push -u origin chore/workspaces-and-docs
   ```
   وافتح PR وادمجه. ملفات `.env` و`storage/` و`node_modules` و`.claude/` متجاهَلة في `.gitignore`.

---

## 10. ورقة الأوامر السريعة

```bash
git switch main && git pull              # ابدأ محدّث
git switch -c feature/اسم                # فرع جديد
git status                               # إيه اللي اتغير؟
git add path/file                        # جهّز ملف
git commit -m "feat(area): message"      # احفظ
git fetch origin && git merge origin/main   # حدّث فرعك
git push -u origin feature/اسم           # ارفع (أول مرة)
git push                                 # ارفع (بعد كده)
git log --oneline -10                    # آخر 10 commits
git diff                                 # التعديلات اللي لسه ما اتجهزتش
npm run dev                              # شغّل الباك والواجهة
npm --prefix backend run migrate         # طبّق migrations
npm --prefix backend run seed            # بيانات تجريبية
npm --prefix backend run test            # اختبارات الباك (بتغيّر القاعدة)
npm --prefix frontend run test           # اختبارات الواجهة
```

أي سؤال أو غموض: اكتبه في الـIssue أو في القروب قبل ما تكمّل، أرخص من إعادة الشغل.
