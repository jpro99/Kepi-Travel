"use client";

import { useState, useEffect } from 'react';
import type { Reservation } from '@/lib/travelAssistant/travelUpdateTypes';

interface AddReservationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddReservation: (reservation: Omit<Reservation, 'id'>) => void;
}

type ReservationType = 'flight' | 'hotel' | 'rental' | 'dining';

export function AddReservationModal({ isOpen, onClose, onAddReservation }: AddReservationModalProps) {
    const [type, setType] = useState<ReservationType>('flight');
    const [formState, setFormState] = useState<any>({});

    useEffect(() => {
        // Reset form when type changes
        setFormState({});
    }, [type]);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        let newReservation: Omit<Reservation, 'id'>;

        switch (type) {
            case 'flight':
                newReservation = {
                    type: 'flight',
                    title: `Flight to ${formState.arrivalAirport || 'TBD'}`,
                    provider: formState.flightNumber || 'Unknown Airline',
                    localTime: formState.departureTime || new Date().toISOString(),
                    location: `${formState.departureAirport || 'TBD'} Gate ${formState.gate || 'TBD'}`,
                    timezone: 'America/New_York', // Simplified
                    confirmationCode: formState.confirmationCode || ''
                };
                break;
            case 'hotel':
                newReservation = {
                    type: 'hotel',
                    title: formState.hotelName || 'Unknown Hotel',
                    provider: 'Hotel',
                    localTime: formState.checkInDate || new Date().toISOString(),
                    location: formState.address || 'Address unknown',
                    confirmationCode: formState.confirmationCode || '',
                    timezone: 'America/New_York', // Simplified
                };
                break;
            case 'rental':
                 newReservation = {
                    type: 'rental',
                    title: `Car Rental from ${formState.rentalCompany || 'TBD'}`,
                    provider: formState.rentalCompany || 'Unknown Company',
                    localTime: formState.pickupTime || new Date().toISOString(),
                    location: formState.pickupLocation || 'Location unknown',
                    confirmationCode: formState.confirmationCode || '',
                    timezone: 'America/New_York', // Simplified
                };
                break;
            case 'dining':
                newReservation = {
                    type: 'dining',
                    title: `Dinner at ${formState.restaurantName || 'TBD'}`,
                    provider: 'Dining',
                    localTime: formState.reservationTime || new Date().toISOString(),
                    location: formState.address || 'Address unknown',
                    confirmationCode: formState.confirmationCode || '',
                    timezone: 'America/New_York', // Simplified
                };
                break;
            default:
                return;
        }

        onAddReservation(newReservation);
        onClose();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormState({ ...formState, [e.target.name]: e.target.value });
    };

    if (!isOpen) return null;

    const renderFormFields = () => {
        switch (type) {
            case 'flight':
                return (
                    <>
                        <input name="flightNumber" type="text" placeholder="Flight Number (e.g., UA123)" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                        <input name="departureTime" type="datetime-local" placeholder="Departure Time" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                        <input name="departureAirport" type="text" placeholder="Departure Airport (e.g., JFK)" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                        <input name="gate" type="text" placeholder="Gate" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                        <input name="arrivalAirport" type="text" placeholder="Arrival Airport (e.g., LAX)" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                        <input name="confirmationCode" type="text" placeholder="Confirmation Code" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                    </>
                );
            case 'hotel':
                return (
                    <>
                        <input name="hotelName" type="text" placeholder="Hotel Name" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                        <input name="checkInDate" type="datetime-local" placeholder="Check-in Date" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                        <input name="address" type="text" placeholder="Address" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                        <input name="confirmationCode" type="text" placeholder="Confirmation Code" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                    </>
                );
            case 'rental':
                return (
                    <>
                        <input name="rentalCompany" type="text" placeholder="Rental Company" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                        <input name="pickupTime" type="datetime-local" placeholder="Pickup Time" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                        <input name="pickupLocation" type="text" placeholder="Pickup Location" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                        <input name="confirmationCode" type="text" placeholder="Confirmation Code" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                    </>
                );
            case 'dining':
                return (
                     <>
                        <input name="restaurantName" type="text" placeholder="Restaurant Name" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                        <input name="reservationTime" type="datetime-local" placeholder="Reservation Time" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                        <input name="address" type="text" placeholder="Address" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                        <input name="confirmationCode" type="text" placeholder="Confirmation Code" onChange={handleInputChange} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700" />
                    </>
                );
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center text-slate-900 dark:text-white">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Add Reservation</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <select value={type} onChange={(e) => setType(e.target.value as ReservationType)} className="w-full p-2 rounded bg-slate-100 dark:bg-slate-700">
                        <option value="flight">Flight</option>
                        <option value="hotel">Hotel</option>
                        <option value="rental">Car Rental</option>
                        <option value="dining">Dining</option>
                    </select>
                    {renderFormFields()}
                    <div className="flex justify-end space-x-2 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded text-sm font-semibold text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-700/50">Cancel</button>
                        <button type="submit" className="px-4 py-2 rounded text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">Add Reservation</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
