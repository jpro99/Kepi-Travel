"use client";

import { useState, useMemo } from 'react';
import { AddReservationModal } from './AddReservationModal';
import type { Reservation } from "@/lib/travelAssistant/travelUpdateTypes";

interface ItineraryTabProps {
    reservations: Reservation[];
    onAddReservation: (reservation: Omit<Reservation, 'id'>) => void;
    onDeleteReservation: (id: string) => void;
}

const ReservationCard = ({ reservation }: { reservation: Reservation }) => {
    const { type, title, provider, localTime, location, confirmationCode } = reservation;

    const renderCardContent = () => {
        switch(type) {
            case 'flight':
                return (
                    <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{provider} - {location}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Confirmation: {confirmationCode}</p>
                    </div>
                );
            case 'hotel':
                 return (
                    <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{location}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Confirmation: {confirmationCode}</p>
                    </div>
                );
            case 'rental':
                 return (
                    <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Pickup: {location}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Confirmation: {confirmationCode}</p>
                    </div>
                );
            case 'dining':
                return (
                    <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{location}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Confirmation: {confirmationCode}</p>
                    </div>
                );
            default:
                return null;
        }
    }

    return (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
            <p className="font-bold text-slate-900 dark:text-white">{title}</p>
            <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{new Date(localTime).toLocaleString()}</p>
            {renderCardContent()}
        </div>
    );
}

export function ItineraryTab({ reservations, onAddReservation, onDeleteReservation }: ItineraryTabProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const sortedReservations = useMemo(() => {
        return [...reservations].sort((a, b) => new Date(a.localTime).getTime() - new Date(b.localTime).getTime());
    }, [reservations]);

    return (
        <section className="space-y-4 pb-6">
            <AddReservationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onAddReservation={onAddReservation}
            />
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Itinerary</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{sortedReservations.length} upcoming events</p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-full bg-[#007AFF] px-4 py-2 text-sm font-semibold text-white shadow-sm active:opacity-80"
                >
                    <span className="text-base leading-none">+</span> Add
                </button>
            </div>

            {sortedReservations.length === 0 ? (
                 <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
                    <p className="text-4xl mb-3">✈️</p>
                    <p className="font-semibold text-slate-900 dark:text-white">Your itinerary is empty</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">Add a flight, hotel, or other reservation to get started.</p>
                    <button type="button" onClick={() => setIsModalOpen(true)} className="rounded-full bg-[#007AFF] px-6 py-2.5 text-sm font-bold text-white">Add Reservation</button>
                </div>
            ) : (
                <div className="space-y-3">
                    {sortedReservations.map(reservation => 
                        <ReservationCard key={reservation.id} reservation={reservation} />
                    )}
                </div>
            )}
        </section>
    );
}
