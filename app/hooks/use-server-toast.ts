import { useEffect } from 'react';
import { toast as showToast } from 'sonner';
import { type Toast } from '~/utils/toast/toast-types';

export function useServerToast(toast?: Toast | null) {
	useEffect(() => {
		if (toast) {
			setTimeout(() => {
				showToast[toast.type](toast.title, {
					id: toast.id,
					description: toast.description,
				});
			}, 0);
		}
	}, [toast]);
}
