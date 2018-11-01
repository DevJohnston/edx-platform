"""
Wrapper methods for emitting events to Segment directly (rather than through tracking log events).

These take advantage of properties that are extracted from incoming requests by track middleware,
stored in tracking context objects, and extracted here to be passed to Segment as part of context
required by server-side events.

To use, call "from track import segment", then call segment.track() or segment.identify().

"""

import analytics

from django.conf import settings
from eventtracking import tracker


def track(user_id, event_name, properties=None, context=None):
    """blah"""
    
    if event_name is not None and hasattr(settings, 'LMS_SEGMENT_KEY') and settings.LMS_SEGMENT_KEY:
        tracking_context = tracker.get_tracker().resolve_context()
        properties = properties or {}
        segment_context = dict(context)
        if 'ip' not in segment_context and 'ip' in tracking_context:
            segment_context['ip'] = tracking_context.get('ip')

        if ('Google Analytics' not in segment_context or 'clientId' not in segment_context['Google Analytics']) and 'client_id' in tracking_context:
            segment_context['Google Analytics'] = {
                'clientId': tracking_context.get('client_id')
            }

        user_agent = tracking_context.get('agent')
        if user_agent is not None:
            segment_context['userAgent'] = user_agent
        path = tracking_context.get('path')
        referer = tracking_context.get('referer')
        page = tracking_context.get('page')
        if path is not None or referer is not None or page is not None:
            segment_context['page'] = {}
            if path is not None:
                segment_context['page']['path'] = path
            if referer is not None:
                segment_context['page']['referrer'] = referer
            if page is not None:
                segment_context['page']['url'] = page
            

        analytics.track(user_id, event_name, properties, segment_context)


def identify(user_id, properties, context):
    if hasattr(settings, 'LMS_SEGMENT_KEY') and settings.LMS_SEGMENT_KEY:
        analytics.identify(user_id, properties, context)

