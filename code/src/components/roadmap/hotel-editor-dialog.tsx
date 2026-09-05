"use client";

import { useState } from "react";
import { Button, Dialog, DialogContent, DialogFooter, TextField } from "@/components/ui";
import type { Hotel } from "@/types/itinerary";

export function HotelEditorDialog({
  open,
  onOpenChange,
  hotel,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hotel: Hotel;
  onSave: (patch: Partial<Hotel>) => void;
}) {
  const [name, setName] = useState(hotel.name);
  const [price, setPrice] = useState(String(hotel.pricePerNight));
  const [nights, setNights] = useState(String(hotel.nights));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(hotel.name);
          setPrice(String(hotel.pricePerNight));
          setNights(String(hotel.nights));
        }
        onOpenChange(next);
      }}
    >
      <DialogContent title="Change hotel" description="Updates the trip's estimated cost immediately.">
        <div className="flex flex-col gap-4">
          <TextField id="hotel-name" label="Hotel name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              id="hotel-price"
              label="Price per night"
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <TextField
              id="hotel-nights"
              label="Nights"
              type="number"
              min={1}
              value={nights}
              onChange={(e) => setNights(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave({
                name: name.trim(),
                pricePerNight: Math.max(0, Number(price) || 0),
                nights: Math.max(1, Number(nights) || 1),
                isDemoData: true,
                referenceUrl: null,
              });
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
