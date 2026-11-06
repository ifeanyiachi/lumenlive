import { create } from "zustand"

interface AccountMenuState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useAccountMenuStore = create<AccountMenuState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

export function openAccountMenu() {
  useAccountMenuStore.getState().setOpen(true)
}
