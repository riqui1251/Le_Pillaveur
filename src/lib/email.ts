import { Resend } from 'resend'

let resendClient: Resend | null = null

function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('RESEND_API_KEY manquant')
    resendClient = new Resend(apiKey)
  }
  return resendClient
}

function getAppUrl(): string {
  return (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000'
  )
}

function getEmailFrom(): string {
  return process.env.EMAIL_FROM ?? 'Le Pillaveur <onboarding@resend.dev>'
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const resetUrl = `${getAppUrl()}/compte/reinitialiser?token=${encodeURIComponent(token)}`

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h1 style="color: #d97706;">Le Pillaveur</h1>
      <p>Bonjour,</p>
      <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
      <p>
        <a href="${resetUrl}" style="display: inline-block; background: #f59e0b; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Réinitialiser mon mot de passe
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      <p style="color: #999; font-size: 12px; word-break: break-all;">${resetUrl}</p>
    </div>
  `

  const resend = getResend()
  const { error } = await resend.emails.send({
    from: getEmailFrom(),
    to,
    subject: 'Réinitialisation de votre mot de passe — Le Pillaveur',
    html,
  })

  if (error) {
    console.error('Resend error:', error)
    throw new Error('Envoi email échoué')
  }
}
