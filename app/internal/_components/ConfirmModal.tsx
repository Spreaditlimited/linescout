"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";

type Props = { open:boolean; title:string; description?:string; confirmText?:string; cancelText?:string; danger?:boolean; children?:ReactNode; variant?:"dark"|"light"; onConfirm:()=>void; onCancel:()=>void };
export default function ConfirmModal({open,title,description,confirmText="Confirm",cancelText="Cancel",danger=false,children,onConfirm,onCancel}:Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onCancel(); }}><Dialog.Portal>
    <Dialog.Overlay className="li-dialog-overlay" />
    <Dialog.Content className="li-dialog" onOpenAutoFocus={event => { event.preventDefault(); cancelRef.current?.focus(); }}>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description className={description ? undefined : "sr-only"}>{description || "Review this action before continuing."}</Dialog.Description>
      <Dialog.Close asChild><button className="li-dialog-close" aria-label="Close dialog"><X size={18} /></button></Dialog.Close>
      {children && <div className="mt-4">{children}</div>}
      <div className="li-dialog-actions"><button ref={cancelRef} type="button" onClick={onCancel}>{cancelText}</button><button type="button" data-danger={danger} onClick={onConfirm}>{confirmText}</button></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
