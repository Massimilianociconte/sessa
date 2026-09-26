"use client";

import { startTransition, type FormEvent } from "react";

/**
 * React 19 resetta i campi non controllati dopo ogni `<form action={fn}>`:
 * dopo un errore di validazione il cliente ritrovava il form vuoto. Questo
 * handler invia la stessa FormData all'action dentro una transition senza il
 * reset automatico. Senza JavaScript resta attivo il normale `action` del form.
 */
export function submitWithoutReset(action: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    let formData: FormData;
    try {
      formData = submitter ? new FormData(event.currentTarget, submitter) : new FormData(event.currentTarget);
    } catch {
      formData = new FormData(event.currentTarget);
    }
    startTransition(() => action(formData));
  };
}
