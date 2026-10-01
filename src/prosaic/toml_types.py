"""The enumerable Date subtypes returned by the frozen TOML parser.

Unlike ordinary JavaScript Dates, TOML local dates, times and floating date-times
carry enumerable flags. Their overridden ISO methods also affect JSON and YAML.
"""
from __future__ import annotations

import datetime
import re


class TomlDate(datetime.date):
    def toml_json(self):
        return getattr(self, 'toml_iso', self.isoformat())

    def toml_enumerable(self):
        return {'isDate': True}


class TomlFloatingDateTime(datetime.datetime):
    def toml_json(self):
        return getattr(self, 'toml_iso', self.isoformat(timespec='milliseconds'))

    def toml_enumerable(self):
        return {'isFloating': True}


class TomlTime(datetime.time):
    def toml_json(self):
        return self.isoformat(timespec='milliseconds')

    def toml_enumerable(self):
        return {'isTime': True}


class TomlOffsetDateTime(datetime.datetime):
    """Carries ISO text for JavaScript dates outside Python's year range."""
    def toml_json(self):
        return self.toml_iso

    def toml_enumerable(self):
        return {}


def preserve_toml_dates(value):
    if isinstance(value, datetime.datetime):
        if value.tzinfo is None:
            return TomlFloatingDateTime(value.year, value.month, value.day, value.hour,
                                        value.minute, value.second, value.microsecond)
        return value
    if isinstance(value, datetime.date):
        return TomlDate(value.year, value.month, value.day)
    if isinstance(value, datetime.time):
        return TomlTime(value.hour, value.minute, value.second, value.microsecond)
    if isinstance(value, dict):
        return {key: preserve_toml_dates(item) for key, item in value.items()}
    if isinstance(value, list):
        return [preserve_toml_dates(item) for item in value]
    return value


def parse_toml_temporal(raw):
    """Apply JavaScript Date normalization, including excess February days."""
    match = re.fullmatch(r'(\d{4})-(\d+)-(\d*)(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?)?', raw)
    if match:
        year, month, day = (int(item or 1) for item in match.groups()[:3])
        hour, minute, second = (int(item or 0) for item in match.groups()[3:6])
        milliseconds = int((match[7] or '')[:3].ljust(3, '0'))
        offset = match[8]
        if not 1 <= month <= 12 or not 1 <= day <= 31 or minute > 59 or second > 59 or hour > 24 or hour == 24 and (minute or second or milliseconds):
            raise ValueError('Invalid Datetime')
        try:
            proxy_year = 400 if year == 0 else (2399 if year == 9999 else year)
            value = datetime.datetime(proxy_year, month, 1) + datetime.timedelta(days=day - 1, hours=hour, minutes=minute, seconds=second, milliseconds=milliseconds)
        except ValueError as error:
            raise ValueError('Invalid Datetime') from error
        if not match[4]:
            if len(match[3]) != 2 or len(match[2]) != 2:
                value = value.astimezone(datetime.timezone.utc)
            actual_year = value.year + year - proxy_year
            date = TomlDate(value.year, value.month, value.day)
            if actual_year != value.year:
                date.toml_iso = f'{actual_year}-{value.month:02d}-{value.day:02d}'
            return date
        if offset:
            if offset == 'Z':
                zone = datetime.timezone.utc
            else:
                offset_hour, offset_minute = map(int, offset[1:].split(':'))
                if offset_hour > 23 or offset_minute > 59:
                    raise ValueError('Invalid Datetime')
                zone = datetime.timezone(datetime.timedelta(minutes=(offset_hour * 60 + offset_minute) * (-1 if offset[0] == '-' else 1)))
            value = value.replace(tzinfo=zone).astimezone(datetime.timezone.utc)
            actual_year = value.year + year - proxy_year
            if actual_year != value.year:
                offset_value = TomlOffsetDateTime(value.year, value.month, value.day, value.hour, value.minute, value.second, value.microsecond, tzinfo=value.tzinfo)
                iso_year = f'{actual_year:04d}' if 0 <= actual_year <= 9999 else f'{"-" if actual_year < 0 else "+"}{abs(actual_year):06d}'
                offset_value.toml_iso = iso_year + value.isoformat(timespec='milliseconds')[4:].replace('+00:00', 'Z')
                return offset_value
            return value
        floating = TomlFloatingDateTime(value.year, value.month, value.day, value.hour, value.minute, value.second, value.microsecond)
        actual_year = value.year + year - proxy_year
        if actual_year != value.year:
            floating.toml_iso = str(actual_year) + floating.isoformat(timespec='milliseconds')[4:]
        return floating
    match = re.fullmatch(r'(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?', raw)
    if not match:
        raise ValueError('Invalid Datetime')
    hour, minute, second = map(int, match.groups()[:3])
    milliseconds = int((match[4] or '')[:3].ljust(3, '0'))
    if hour > 24 or minute > 59 or second > 59 or hour == 24 and (minute or second or milliseconds):
        raise ValueError('Invalid Datetime')
    return TomlTime(hour % 24, minute, second, milliseconds * 1000)
