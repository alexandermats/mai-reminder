import { describe, it, expect } from 'vitest'
import { ChronoLocalParser } from '../src/parser/localParser'

const REF_DATE = new Date('2026-02-23T10:00:00.000Z')

describe('Local parser recurrence NLP coverage', () => {
  const parser = new ChronoLocalParser({ referenceDate: REF_DATE })

  const enCases: Array<{ text: string; expectedRule: string }> = [
    { text: 'Pay rent every month at 9am', expectedRule: 'FREQ=MONTHLY' },
    { text: 'Book club each month at 18:30', expectedRule: 'FREQ=MONTHLY' },
    {
      text: 'Submit expense report every 3 months at 09:15',
      expectedRule: 'FREQ=MONTHLY;INTERVAL=3',
    },
    { text: 'Budget review every two months at 9am', expectedRule: 'FREQ=MONTHLY;INTERVAL=2' },
    { text: 'Call mom every Thursday at 7am', expectedRule: 'FREQ=WEEKLY;BYDAY=TH' },
    { text: 'Standup each Tuesday at 10:00', expectedRule: 'FREQ=WEEKLY;BYDAY=TU' },
    {
      text: 'Practice piano every weekday at 6pm',
      expectedRule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    },
    { text: 'Take vitamins every day at 8am', expectedRule: 'FREQ=DAILY' },
    { text: 'Backup database daily at 01:00', expectedRule: 'FREQ=DAILY' },
    { text: 'Deep clean every 2 days at 7pm', expectedRule: 'FREQ=DAILY;INTERVAL=2' },
    { text: 'Water plants each five days at 9am', expectedRule: 'FREQ=DAILY;INTERVAL=5' },
    { text: 'Review roadmap every week at 11am', expectedRule: 'FREQ=WEEKLY' },
    { text: 'Send summary each week at 16:00', expectedRule: 'FREQ=WEEKLY' },
    { text: 'Payroll every 2 weeks at 09:00', expectedRule: 'FREQ=WEEKLY;INTERVAL=2' },
    {
      text: 'Status sync every 2 weeks on Monday at 9am',
      expectedRule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO',
    },
    { text: 'Stretch every hour', expectedRule: 'FREQ=HOURLY;INTERVAL=1' },
    { text: 'Ping service each hour', expectedRule: 'FREQ=HOURLY;INTERVAL=1' },
    { text: 'Check hydration each 2 hours', expectedRule: 'FREQ=HOURLY;INTERVAL=2' },
    { text: 'Rotate logs every 4 hours', expectedRule: 'FREQ=HOURLY;INTERVAL=4' },
    { text: 'Security scan every 6 hours', expectedRule: 'FREQ=HOURLY;INTERVAL=6' },
    // E12-02: new natural-language examples
    { text: 'Morning meditation every morning at 7am', expectedRule: 'FREQ=DAILY' },
    { text: 'Evening walk every evening at 6pm', expectedRule: 'FREQ=DAILY' },
    { text: 'Night journal every night at 10pm', expectedRule: 'FREQ=DAILY' },
    { text: 'Gym every other day at 8am', expectedRule: 'FREQ=DAILY;INTERVAL=2' },
    {
      text: 'Team retrospective biweekly on Monday at 10am',
      expectedRule: 'FREQ=WEEKLY;INTERVAL=2',
    },
    { text: 'Payslip reminder bi-weekly at 9am', expectedRule: 'FREQ=WEEKLY;INTERVAL=2' },
    { text: 'Archive logs fortnightly at 02:00', expectedRule: 'FREQ=WEEKLY;INTERVAL=2' },
    { text: 'Family time every weekend at 10am', expectedRule: 'FREQ=WEEKLY;BYDAY=SA,SU' },
    { text: 'Yoga on weekends at 9am', expectedRule: 'FREQ=WEEKLY;BYDAY=SA,SU' },
    {
      text: 'Daily standup every workday at 9am',
      expectedRule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    },
    {
      text: 'Piano practice every Mon, Wed and Fri at 6pm',
      expectedRule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    },
    { text: 'Run every Tue, Thu at 7am', expectedRule: 'FREQ=WEEKLY;BYDAY=TU,TH' },
  ]

  const ruCases: Array<{ text: string; expectedRule: string }> = [
    { text: 'Платить аренду каждый месяц в 09:00', expectedRule: 'FREQ=MONTHLY' },
    { text: 'Сверять бюджет ежемесячно в 11:00', expectedRule: 'FREQ=MONTHLY' },
    { text: 'Делать ТО каждые 3 месяца в 10:00', expectedRule: 'FREQ=MONTHLY;INTERVAL=3' },
    { text: 'Созвон с командой каждый четверг в 19:00', expectedRule: 'FREQ=WEEKLY;BYDAY=TH' },
    { text: 'Английский по вторникам в 08:00', expectedRule: 'FREQ=WEEKLY;BYDAY=TU' },
    { text: 'Созвон по пятницам в 16:00', expectedRule: 'FREQ=WEEKLY;BYDAY=FR' },
    { text: 'Контроль веса каждую среду в 07:30', expectedRule: 'FREQ=WEEKLY;BYDAY=WE' },
    { text: 'Читать по будням в 18:00', expectedRule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
    { text: 'Принимать лекарство каждый день в 08:00', expectedRule: 'FREQ=DAILY' },
    { text: 'Заполнять дневник ежедневно в 21:30', expectedRule: 'FREQ=DAILY' },
    { text: 'Поливать цветы каждые 2 дня в 09:00', expectedRule: 'FREQ=DAILY;INTERVAL=2' },
    { text: 'Делать уборку каждые пять дней в 12:00', expectedRule: 'FREQ=DAILY;INTERVAL=5' },
    { text: 'Планерка каждую неделю в 09:00', expectedRule: 'FREQ=WEEKLY' },
    { text: 'Отправлять отчет еженедельно в 17:00', expectedRule: 'FREQ=WEEKLY' },
    { text: 'Платежи каждые 2 недели в 10:00', expectedRule: 'FREQ=WEEKLY;INTERVAL=2' },
    { text: 'Проверка каждые 2 недели', expectedRule: 'FREQ=WEEKLY;INTERVAL=2' },
    { text: 'Разминка каждый час', expectedRule: 'FREQ=HOURLY;INTERVAL=1' },
    { text: 'Пить воду каждые 2 часа', expectedRule: 'FREQ=HOURLY;INTERVAL=2' },
    { text: 'Проверять почту каждые 4 часа', expectedRule: 'FREQ=HOURLY;INTERVAL=4' },
    { text: 'Дежурство каждые шесть часов', expectedRule: 'FREQ=HOURLY;INTERVAL=6' },
    // E12-02: new natural-language examples
    { text: 'Медитация каждое утро в 07:00', expectedRule: 'FREQ=DAILY' },
    { text: 'Прогулка каждый вечер в 19:00', expectedRule: 'FREQ=DAILY' },
    { text: 'Дневник каждую ночь в 22:00', expectedRule: 'FREQ=DAILY' },
    { text: 'Бег через день в 08:00', expectedRule: 'FREQ=DAILY;INTERVAL=2' },
    { text: 'Витамины раз в день в 09:00', expectedRule: 'FREQ=DAILY' },
    { text: 'Стрижка раз в месяц в 12:00', expectedRule: 'FREQ=MONTHLY' },
    { text: 'Созвон с другом раз в неделю в 18:00', expectedRule: 'FREQ=WEEKLY' },
    { text: 'Поход по выходным в 10:00', expectedRule: 'FREQ=WEEKLY;BYDAY=SA,SU' },
    { text: 'Уборка каждые выходные в 11:00', expectedRule: 'FREQ=WEEKLY;BYDAY=SA,SU' },
    {
      text: 'Утренняя зарядка каждый рабочий день в 07:30',
      expectedRule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    },
    {
      text: 'Английский по понедельникам и средам в 19:00',
      expectedRule: 'FREQ=WEEKLY;BYDAY=MO,WE',
    },
    { text: 'Спортзал по вторникам и четвергам в 08:00', expectedRule: 'FREQ=WEEKLY;BYDAY=TU,TH' },
  ]

  it.each(enCases)('EN: $text', async ({ text, expectedRule }) => {
    const result = await parser.parse({ text, language: 'en' })
    expect(result.recurrenceRule).toBe(expectedRule)
  })

  it.each(ruCases)('RU: $text', async ({ text, expectedRule }) => {
    const result = await parser.parse({ text, language: 'ru' })
    expect(result.recurrenceRule).toBe(expectedRule)
  })

  it('EN: respects future start time for today (issue 6-3)', async () => {
    // Reference date is 2026-02-23T10:00:00.000Z
    const text = 'Take pill every 2 days at 9pm'
    const result = await parser.parse({ text, language: 'en' })
    // The date should be on the 23rd, not shifted by 2 days to the 25th
    expect(result.scheduledAt?.getDate()).toBe(23)
    expect(result.scheduledAt?.getHours()).toBe(21)
  })
})
