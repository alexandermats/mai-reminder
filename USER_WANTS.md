1. надо сделать чуть больше время, которое он слушает (increase silence timeout).
2. Impove local parsing engine , add more natuaral examples to NLP tests like "пойти к врачу завтра в 5", "workout every day at ten". Fix issues reported by users:
   a) он упорно не понимает "напомни мне в 14 55 что у меня кофе". не понимает время. если сказать в два 55 дня - то ок.
   b) Иногда пятьдесят пять воспринимает как 50 минут, а напомнить через 5 дней
3. в списке напоминаний время лучше сделать отдельным столбиком и больше. т.е.: первый столбец: время (большим) под ним как сейчас дата и день. следующий: интервал. Следующий столбик: текст напоминания. Следующий: оставшееся время до напоминания. Короче хочется, чтобы сразу было понятно время и название. + периодичность
4. Fix UI refresh issue: currently UI is not updated properly (time for upcoming reminders stays the same until changing the tab or re-opening the app)
5. Allow specifying recurrence interval when saving/edition reminders
6. Auto-start option for desktop app
7. было бы неплохо сделать на всплывающем окне уведомления кнопки: отложить на 15 минут, час, день. можно с выбором цифр (only for non-recurring reminders fow now)
8. пропущенные напоминания: в трее кидать всплывающее уведомление, что были пропущены напоминания и цифра (сколько). при нажатии - кидаем на список отправленных уведомлений
9. сделать синхронизацию между девайсами без всяких логинов, и с шифрованием конечно
   It should work like this: a) Option in the menu to turn on cloud sync b) when turned on first time, app connects to a backend and creates cloud db (encrypted) for the user (random user id assigned). c) When cloud sync is On, Allow user to pair with mobile device by using QR code. d) Apps on desktop and mobile syncs with cloud db every one minute - make sure DB is transactional and logic is rebust to prevent race conditions and data loss
