import { describe, expect, it } from 'vitest'

import { consumeAppointmentLink } from './appointment-link'

describe('atalhos de novo agendamento', () => {
  it('abre o formulário para o paciente e preserva outros parâmetros', () => {
    expect(consumeAppointmentLink(new URL('http://localhost/agenda?novo=1&paciente=p-1&view=day#top'))).toEqual({
      patientId: 'p-1',
      nextUrl: '/agenda?view=day#top',
    })
  })

  it('abre sem paciente a partir do painel', () => {
    expect(consumeAppointmentLink(new URL('http://localhost/agenda?novo=1'))).toEqual({
      patientId: undefined,
      nextUrl: '/agenda',
    })
  })

  it('ignora URLs que não solicitam criação', () => {
    expect(consumeAppointmentLink(new URL('http://localhost/agenda?paciente=p-1'))).toBeNull()
  })
})
