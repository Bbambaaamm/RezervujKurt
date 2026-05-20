const PROFILE_SAVE_HTTP_ERROR_MESSAGE = 'Uložení jména se nepodařilo. Zkuste to prosím znovu.';
const PROFILE_SAVE_TRANSPORT_ERROR_MESSAGE = 'Profil se nepodařilo uložit. Zkontrolujte připojení a zkuste to znovu.';

export function resolveProfileSaveErrorMessage(error: unknown, responseOk?: boolean): string | null {
  if (responseOk === false) {
    return PROFILE_SAVE_HTTP_ERROR_MESSAGE;
  }

  if (error instanceof Error) {
    return PROFILE_SAVE_TRANSPORT_ERROR_MESSAGE;
  }

  return null;
}

